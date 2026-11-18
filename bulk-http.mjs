#!/usr/bin/env node
// Bulk HTTP requests through the Apify API. Zero dependencies, Node.js 18+.
//
//   node bulk-http.mjs status urls.txt --csv status.csv
//   node bulk-http.mjs api "https://jsonplaceholder.typicode.com/users/{{id}}" --ids 1,2,3 --fields name,company.name
//
// Needs APIFY_TOKEN in the environment.

import { readFileSync, writeFileSync } from 'node:fs';

const ACTOR = 'ctriolab~http-request';
const USAGE = `Usage:
  node bulk-http.mjs status <urls.txt | url ...> [--csv file] [--json file] [--concurrency N]
  node bulk-http.mjs api <url template with {{field}}> (--ids 1,2,3 | --rows rows.json | --rows rows.csv)
                     [--fields a,b.c,name=x.y] [--header "Name: value"]... [--csv file] [--json file] [--concurrency N]`;

function parseArgs(argv) {
    const args = { positional: [], headers: {} };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) { args.positional.push(arg); continue; }
        const value = argv[++i];
        if (value === undefined) fail(`${arg} needs a value`);
        if (arg === '--header') {
            const colon = value.indexOf(':');
            if (colon < 1) fail(`--header must look like "Name: value", got "${value}"`);
            args.headers[value.slice(0, colon).trim()] = value.slice(colon + 1).trim();
        } else {
            args[arg.slice(2)] = value;
        }
    }
    return args;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

function readLines(file) {
    return readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

// A tiny CSV reader for simple files (header row, comma separated, optional double quotes).
function readCsv(file) {
    const [header, ...rows] = readLines(file).map((line) =>
        [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"')));
    return rows.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])));
}

function toCsv(rows) {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const cell = (value) => {
        const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n') + '\n';
}

async function runActor(input) {
    const token = process.env.APIFY_TOKEN;
    if (!token) fail('Set APIFY_TOKEN first (Apify Console > Settings > API & Integrations).');
    // run-sync waits up to 300 seconds; a few thousand requests at concurrency 10 fit in that.
    const response = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?format=json&clean=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (response.status === 408) fail('The run took longer than 300 seconds. Split the list into smaller files.');
    if (!response.ok) fail(`Apify API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return (await response.json()).sort((a, b) => a.index - b.index);
}

function save(rows, args) {
    if (args.csv) writeFileSync(args.csv, toCsv(rows));
    if (args.json) writeFileSync(args.json, JSON.stringify(rows, null, 2));
    if (!args.csv && !args.json) console.log(JSON.stringify(rows, null, 2));
    else console.error(`Saved ${rows.length} rows${args.csv ? ` to ${args.csv}` : ''}${args.json ? ` to ${args.json}` : ''}`);
}

async function checkStatus(args) {
    const urls = args.positional.flatMap((value) => (/^https?:\/\//i.test(value) ? [value] : readLines(value)));
    if (!urls.length) fail(USAGE);
    const items = await runActor({
        requests: urls.map((url) => ({ url })),
        responseFormat: 'auto',
        maxBodyBytes: 20000, // enough for the <title> of most pages
        maxRetries: 1,
        maxConcurrency: Number(args.concurrency ?? 10),
    });
    const rows = items.map((item) => ({
        url: item.url,
        status: item.status,
        ok: item.ok,
        finalUrl: item.finalUrl ?? null,
        redirected: item.finalUrl ? item.finalUrl !== item.url : null,
        responseTimeMs: item.responseTimeMs ?? null,
        contentType: item.contentType ?? null,
        title: item.title ?? null,
        error: item.error,
    }));
    save(rows, args);
    const broken = rows.filter((row) => !row.ok).length;
    console.error(`${rows.length} URLs checked, ${rows.length - broken} OK, ${broken} broken or unreachable.`);
}

async function callApi(args) {
    const [urlTemplate] = args.positional;
    if (!urlTemplate || !urlTemplate.includes('{{')) fail(USAGE);
    let rows;
    if (args.ids) rows = args.ids.split(',').map((id) => ({ id: id.trim() }));
    else if (args.rows?.endsWith('.csv')) rows = readCsv(args.rows);
    else if (args.rows) rows = JSON.parse(readFileSync(args.rows, 'utf8'));
    else fail('api needs --ids or --rows');
    const fields = (args.fields ?? '').split(',').map((field) => field.trim()).filter(Boolean);
    const items = await runActor({
        urlTemplate,
        templateRows: rows,
        templateHeaders: args.headers,
        extractFields: fields,
        responseFormat: fields.length ? 'json' : 'auto',
        maxConcurrency: Number(args.concurrency ?? 5),
    });
    const result = items.map((item) => ({
        ...item.userData,
        status: item.status,
        ...(fields.length ? item.fields : { body: item.body }),
        error: item.error,
    }));
    save(result, args);
}

const args = parseArgs(process.argv.slice(2));
const command = args.positional.shift();
if (command === 'status') await checkStatus(args);
else if (command === 'api') await callApi(args);
else fail(USAGE);
