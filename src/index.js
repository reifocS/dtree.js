const dotenv = require("dotenv");

const YAML = require("yaml");
const { findRequirements, meetsRequirement } = require("./parsing");
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
const CONFIG_PATH = path.join(PARENT, "./test/assets/config2.yaml");
const SITES_PATH = path.join(PARENT, process.env.SITES_PATH || "./sites.json");

const express = require("express");
const { verify } = require("crypto");
const app = express();

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

app.get("/verify", (req, res) => {
  // recovers the sites urls
  //const sites_id_list = req.body.sites || ["site1", "site2", "site3"];
  const sites_id_list = ["site1", "site2", "site3"];

  const sites_config = JSON.parse(readFile(SITES_PATH)).sites;
  const sites = sites_id_list.map((site_id) => {
    const site = sites_config.find((c) => c.id === site_id);

    if (!site) {
      throw new Error(`${site_id} not found`);
    }

    return site;
  });

  // get required fields in the user config
  //const config = YAML.parse(req.body.config);
  const config = YAML.parse(readFile(CONFIG_PATH));
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
    fetch(site.url)
      .then((response) => {
        response.json().then((ressources) => {
          for (const requirement of splittedRequirements) {
            const requirement_copy = { ...requirement };
            // We check if the requirement is in the resource
            if (meetsRequirement(requirement_copy, ressources, site.id)) {
              console.log("meets requirement");
              requirement.origin = site.id; // we fill the requirement with the resource origin
            }
          }
        });
      })
      .catch(function (err) {
        console.log("Unable to fetch -", err);
      });
  }

  res.send("<pre>" + JSON.stringify(splittedRequirements, null, 2) + "</pre>");
});

app.listen(PORT, HOST, () => {
  console.log(`Running on http://${HOST}:${PORT}`);
});
