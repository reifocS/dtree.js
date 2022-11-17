const dotenv = require("dotenv");

const YAML = require("yaml");
const { parse } = require("./parsing");
const { readFile } = require("./system");
const path = require("path");

const PARENT = path.resolve(__dirname, "..");
dotenv.config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const TEMPLATE_PATH = path.join(
  PARENT,
  process.env.TEMPLATE_PATH || "./template.json"
);
const SITES_PATH = path.join(PARENT, process.env.SITES_PATH || "./sites.json");

const express = require("express");
const app = express();

const template = JSON.parse(readFile(TEMPLATE_PATH));

app.get("/", (req, res) => {
  res.send("Hello world!");
});

app.post("/verify", (req, res) => {

  // recovers the sites urls
  const sites_id_list = req.body.sites;
  const sites_config = JSON.parse(readFile(SITES_PATH)).sites;
  const sites = sites_id_list.map((site_id) => {
    const url = sites_config.find((c) => c.id === site_id)?.url;

    if (!url) {
      throw new Error(`${site_id} not found`);
    }

    return url;
  });

  // get required fields in the user config
  const config = YAML.parse(req.body.config);
  const parsed = parse(config, template.definitions);

  for (const site of sites) {
    fetch(site)
      .then((response) => {
        
      })
      .catch(function (err) {
        console.log("Unable to fetch -", err);
      });
  }

  res.send(JSON.stringify(parsed, "", "  "));
});

app.listen(PORT, HOST, () => {
  console.log(`Running on http://${HOST}:${PORT}`);
});
