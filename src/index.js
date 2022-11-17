
const dotenv = require('dotenv')

const YAML = require("yaml");
const { parse } = require("./parsing")
const { readFile } = require("./system")
const path = require("path");

const PARENT = path.resolve(__dirname, '..')
dotenv.config()

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TEMPLATE_PATH = path.join(PARENT, process.env.TEMPLATE_PATH || "./template.json")
const SITES_PATH = path.join(PARENT, process.env.SITES_PATH || "./sites.json")

const express = require('express')
const app = express()

const template = JSON.parse(readFile(TEMPLATE_PATH))

app.get('/', (req, res) => {
  const parsed = parse(config, template.definitions)
  res.send(JSON.stringify(parsed, "", "  "))
})

app.post('/verify', (req, res) => {
  const sites = req.body.sites
  const config = YAML.parse(req.body.config)
  const parsed = parse(config, template.definitions)

  for (const site of sites) {
    fetch(site)
    .then((response) => {
      // Do something with response
    })
    .catch(function (err) {
      console.log("Unable to fetch -", err);
    });
  }

  res.send(JSON.stringify(parsed, "", "  "))
})

app.listen(PORT, HOST, () => {
  console.log(`Running on http://${HOST}:${PORT}`);
});


