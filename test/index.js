const YAML = require("yaml");
const path = require("path");

const express = require("express");
const bodyParser = require("body-parser");

const { findRequirements, meetsRequirement } = require("../lib/parsing");
const { readFile } = require("../lib/system");

const dotenv = require("dotenv");
dotenv.config();

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const SITE_ID = process.env.SITE_ID || "Defaut";

const SITES_PATH = path.join(
  __dirname,
  process.env.SITES_PATH || "/assets/sites.json"
);

const TEMPLATE_PATH = path.join(
  __dirname,
  process.env.TEMPLATE_PATH || "/assets/template.json"
);
const CONFIG_PATH = path.join(
  __dirname,
  process.env.CONFIG_PATH || "/assets/config2.yaml"
);
const RESOURCES_PATH = path.join(
  __dirname,
  process.env.RESOURCES_PATH || "/resources/resources_A.json"
);

const app = express();
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(
  bodyParser.urlencoded({
    extended: true, // to support URL-encoded bodies
  })
);
const template = JSON.parse(readFile(TEMPLATE_PATH));

app.get("/", (req, res) => {
  const config = YAML.parse(readFile(CONFIG_PATH));
  const { outputAsList, outputAsTree } = findRequirements(
    config,
    template.definitions
  );

  res.send(
    "<pre>" +
      JSON.stringify(outputAsList, null, 2) +
      "</pre>" +
      "<pre>" +
      JSON.stringify(outputAsTree, null, 2) +
      "</pre>"
  );
});

app.post("/verify", async (req, res) => {
  // recovers the sites urls
  const sites_id_list = JSON.parse(req.body.sites) || [];
  const sites_config = JSON.parse(readFile(SITES_PATH)).sites;
  const sites = sites_id_list.map((site_id) => {
    const site = sites_config.find((c) => c.id === site_id);

    if (!site) {
      throw new Error(`${site_id} not found`);
    }

    return site;
  });

  // get required fields in the user config
  const config = YAML.parse(req.body.config);

  const { outputAsList, outputAsTree } = findRequirements(
    config,
    template.definitions
  );

  const splittedRequirements = outputAsList.map((r) => ({
    value: r.value,
    path: r.path.split("."),
    origin: null,
  }));

  for (const site of sites) {
    const response = await fetch(site.url);
    const ressources = await response.json();
    for (const requirement of splittedRequirements) {
      const requirement_copy = { ...requirement };
      // We check if the requirement is in the resource
      if (meetsRequirement(requirement_copy, ressources, site.id)) {
        requirement.origin = site.id; // we fill the requirement with the resource origin
      }
    }
  }

  // Reconstruct path from splitted
  const requirements = splittedRequirements.map((s) => ({
    ...s,
    path: s.path.join("."),
  }));

  res.send(requirements);
});

app.get("/resources", (req, res) => {
  res.send(readFile(RESOURCES_PATH));
});

app.listen(PORT, HOST, () => {
  console.log(`${SITE_ID} is running on http://${HOST}:${PORT}`);
});
