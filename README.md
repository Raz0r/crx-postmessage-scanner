# crx-postmessage-scanner

CRX postMessage Scanner is a set of scripts that can be used to find message listeners in content scripts of Chrome extensions.

## harvest.js

Fetches extension IDs from Chrome Web Store given a category.

## download.js

Uses a list of extension IDs to download extensions.

## convert.js 

- converts CRX files into ZIPs, 
- unpacks them, 
- parses manifests, 
- finds content scripts, 
- parses content scripts with Acorn JS
- looks for message listeners using Acorn plugin
- sends results to elasticsearch

## template.json

elasticsearch has limitation on the number of indexed fields, which has to be increased:

`curl -XPUT localhost:9200/_template/extensions -d @template.json`

## Slides

https://raz0r.name/talks/postmessage-security-in-chrome-extensions
