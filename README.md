# bulk-http-requests

Send hundreds of HTTP requests from a list and get one clean table back. One file, zero dependencies, Node.js 18+.

Two jobs it does well:

- **Check a list of URLs**: status code, redirect target, response time, content type and page title for every link,
  with DNS errors and timeouts reported per row instead of crashing the script.
- **Call a REST API once per ID**: fill a URL template like `https://api.example.com/users/{{id}}` from a list of IDs
  or a CSV file, and pull only the JSON fields you need (dot paths, renames) into CSV or JSON.

The requests run in the cloud on the [HTTP Request Actor](https://apify.com/ctriolab/http-request?utm_source=github&utm_medium=readme&utm_campaign=bulk-http-requests) on Apify
(parallel, retries on 429 and 5xx, `Retry-After` respected). This script sends your list, waits for the run
(`run-sync-get-dataset-items`) and writes the table. Your own machine and IP address never send the requests.

## Quick start

1. Get an Apify API token: sign up at apify.com (the free plan includes monthly credit), then
   Console > Settings > API & Integrations.
2. Clone and set the token:

   ```bash
   git clone https://github.com/ctriolab/bulk-http-requests.git
   cd bulk-http-requests
   export APIFY_TOKEN=your_token          # Windows PowerShell: $env:APIFY_TOKEN="your_token"
   ```

3. Run one of the two commands:

   ```bash
   node bulk-http.mjs status examples/urls.txt --csv status.csv
   node bulk-http.mjs api "https://jsonplaceholder.typicode.com/users/{{id}}" --ids 1,2,3 --fields "name,email,city=address.city,company=company.name"
   ```

## Real output

Both commands above, run on 2026-11-18.

### 1. URL status check

```text
Saved 5 rows to status.csv
5 URLs checked, 3 OK, 2 broken or unreachable.
```

`status.csv` (finished in about 4 seconds):

```csv
url,status,ok,finalUrl,redirected,responseTimeMs,contentType,title,error
https://example.com,200,true,https://example.com,false,90,text/html; charset=utf-8,Example Domain,
http://github.com,200,true,https://github.com/,true,103,text/html; charset=utf-8,GitHub · Change is constant. GitHub keeps you ahead. · GitHub · GitHub,
https://httpbin.org/status/404,404,false,https://httpbin.org/status/404,false,52,text/html; charset=utf-8,,
https://www.python.org/doc/,200,true,https://www.python.org/doc/,false,108,text/html; charset=utf-8,Our Documentation | Python.org,
https://this-domain-does-not-exist-ctriolab.com,,false,,,,,,DNS lookup failed (ENOTFOUND)
```

### 2. REST API call per ID, selected fields only

```json
[
  {
    "id": "1",
    "status": 200,
    "name": "Leanne Graham",
    "email": "Sincere@april.biz",
    "city": "Gwenborough",
    "company": "Romaguera-Crona",
    "error": null
  },
  {
    "id": "2",
    "status": 200,
    "name": "Ervin Howell",
    "email": "Shanna@melissa.tv",
    "city": "Wisokyburgh",
    "company": "Deckow-Crist",
    "error": null
  },
  {
    "id": "3",
    "status": 200,
    "name": "Clementine Bauch",
    "email": "Nathan@yesenia.net",
    "city": "McKenziehaven",
    "company": "Romaguera-Jacobson",
    "error": null
  }
]
```

Each row keeps your input columns (here `id`), so you can join the results back to your own table.

## More examples

```bash
# Rows from a CSV file: every column can be used as {{column}} and comes back in the output
node bulk-http.mjs api "https://jsonplaceholder.typicode.com/posts/{{postId}}" --rows examples/posts.csv --fields title --csv posts.csv

# An API that needs a key: headers are sent with every request
node bulk-http.mjs api "https://api.example.com/v1/orders/{{id}}" --ids 101,102 \
  --header "Authorization: Bearer YOUR_API_KEY" --fields "status,total=amount.total"

# Whole JSON body instead of selected fields, saved to a file
node bulk-http.mjs api "https://jsonplaceholder.typicode.com/todos/{{id}}" --ids 1,2 --json todos.json

# Gentler on a rate-limited API
node bulk-http.mjs api "https://api.example.com/items/{{id}}" --rows ids.json --concurrency 2
```

The CSV rows example above gives:

```csv
postId,note,status,title,error
1,"first, with comma",200,sunt aut facere repellat provident occaecati excepturi optio reprehenderit,
2,second,200,qui est esse,
```

| Option | Mode | Meaning |
|---|---|---|
| `<urls.txt>` or URLs | `status` | A text file with one URL per line, or URLs as arguments |
| `<template>` | `api` | URL with `{{field}}` placeholders, filled once per row |
| `--ids 1,2,3` | `api` | Rows with one `id` column |
| `--rows file.csv` / `file.json` | `api` | Rows from a CSV (header row) or a JSON array of objects |
| `--fields a,b.c,name=x.y` | `api` | JSON dot paths to keep; `name=path` renames. Without it the whole body is returned |
| `--header "Name: value"` | `api` | Extra request header, can repeat |
| `--csv file`, `--json file` | both | Save the table. Without them JSON goes to stdout |
| `--concurrency N` | both | Requests at a time (default 10 for status, 5 for api) |

## Limits of this script

- One call waits up to 300 seconds (the `run-sync` limit). A few thousand URLs fit; split larger lists into several files.
- GET only. POST, PUT, PATCH bodies, curl import, Markdown output and change monitoring are available in the Actor itself.
- Private network addresses (localhost, 10.x, 192.168.x) are blocked by the Actor.

## Hosted version on Apify

The requests run on **[HTTP Request on Apify](https://apify.com/ctriolab/http-request?utm_source=github&utm_medium=readme&utm_campaign=bulk-http-requests)**.
It is billed to your own Apify account per request that gets an HTTP response ($0.50 per 1,000 responses on the free plan,
less on paid plans) plus Apify platform usage. DNS failures, timeouts and blocked addresses are not charged.
From the Apify Console you can also paste curl commands, send POST bodies, schedule runs, keep only changed responses,
and send each result to a webhook (n8n, Make, Zapier).

If this Actor saved you time, a short review on its Apify Store page helps other people find it. Thank you.

This example is maintained by Ctrio Lab, the maker of the Actor.

## License

MIT. See [LICENSE](LICENSE).
