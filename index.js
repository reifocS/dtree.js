const YAML = require('yaml');
const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');

const {
  findRequirements,
  meetsRequirement,
  checkAllRequirements,
} = require('./lib/parsing');
const {readFile} = require('./lib/system');

const dotenv = require('dotenv');
dotenv.config();

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const SITE_ID = process.env.SITE_ID || 'Defaut';

const SITES_PATH = path.join(
  __dirname,
  process.env.SITES_PATH || '/assets/sites.json'
);
const TEMPLATE_PATH = path.join(
  __dirname,
  process.env.TEMPLATE_PATH || '/assets/template.json'
);
const CONFIG_PATH = path.join(
  __dirname,
  process.env.CONFIG_PATH || '/assets/deployment.yaml'
);
const RESOURCES_PATH = path.join(
  __dirname,
  process.env.RESOURCES_PATH || '/resources/resources_A.json'
);

const app = express();
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(
  bodyParser.urlencoded({
    extended: true, // to support URL-encoded bodies
  })
);
const template = JSON.parse(readFile(TEMPLATE_PATH));

/**
 * Check in local database for availlabel ressources and fill the
 * splitted requirements given in parameter with found locations
 * @param {object} splittedRequirements
 * @param {object} ressourcesInDb
 * @param {string[]} sitesIdList
 */
function verifyLocal(splittedRequirements, ressourcesInDb, sitesIdList) {
  // Check for requirements in local
  checkAllRequirements(splittedRequirements, ressourcesInDb.local, SITE_ID);

  // Check if we have info for distant in our local db
  for (const site of sitesIdList) {
    if (ressourcesInDb.distant[site]) {
      checkAllRequirements(
        splittedRequirements,
        ressourcesInDb.distant[site],
        site
      );
    }
  }
}

/**
 * Check for each specified remote site for the ressources
 * and fill the splitted requirements given in parameter with found locations
 * @param {object} splittedRequirements
 * @param {object[]} sites
 */
async function verifyRemote(splittedRequirements, sites) {
  for (const site of sites) {
    console.log(`verifying for distant ${site.id}`);
    const response = await fetch(site.url + '/resources');
    const ressources = await response.json();

    const ressourcesInSite = ressources.local;
    for (const requirement of splittedRequirements) {
      const requirement_copy = {...requirement};

      // We check if the requirement is in the resource
      if (meetsRequirement(requirement_copy, ressourcesInSite, site.id)) {
        if (!requirement.origin.find(origin => origin === site.id))
          requirement.origin.push(site.id); // we fill the requirement with the resource origin
      }
    }
  }
}

// ==========================================================
//                      API EXPOSITIONS
// ==========================================================

app.get('/', (req, res) => {
  let output;

  try {
    // We read the config from the local file
    const config = YAML.parse(readFile(CONFIG_PATH));

    // Then we extract requirements from it
    output = findRequirements(config, template.definitions);
  } catch (error) {
    console.error(error);
    return res.status(400).send(error);
  }

  res.send(
    '<pre>' +
      JSON.stringify(output.list, null, 2) +
      '</pre>' +
      '<pre>' +
      JSON.stringify(output.tree, null, 2) +
      '</pre>'
  );
});

app.post('/verify', async (req, res) => {
  let splittedRequirements;

  try {
    // We read the config from the body
    const config = YAML.parse(req.body.config);

    // Read the sites from the body
    const sitesIdList = JSON.parse(req.body.sites) || [];

    // Read the local database of ressources
    const ressourcesInDb = JSON.parse(readFile(RESOURCES_PATH));

    // Extract required fields from the user config
    const output = findRequirements(config, template.definitions);

    // Read the remote location urls
    const sitesConfig = JSON.parse(readFile(SITES_PATH)).sites;

    // Recover the targets sites from the request
    const sites = sitesIdList.map(id => {
      const site = sitesConfig.find(c => c.id === id);
      if (!site) throw new Error(`${id} not found`);
      return site;
    });

    // Split the requirements paths
    splittedRequirements = output.list.map(r => ({
      value: r.value, // keep the value
      path: r.path.split('.'), // split the path
      origin: [], // initialize an empty origin
    }));

    // 1. CHECK FIRST IN LOCAL
    verifyLocal(splittedRequirements, ressourcesInDb, sitesIdList);

    // If we have everything is in local, then we don't need to query distant db
    const everythingPresentInLocal = splittedRequirements.every(p => {
      return p.origin.length > 0;
    });

    if (everythingPresentInLocal) {
      console.log('Everything present in local, no need to query distant DB');
    }
    // 2. OTHERWISE, WE HAVE TO CHECK FOR EACH DISTANT LOCATION
    if (!everythingPresentInLocal) {
      await verifyRemote(splittedRequirements, sites);
    }
  } catch (error) {
    console.error(error);
    return res.status(400).send(error);
  }

  // We reconstruct the paths from the splitted requirements
  const requirements = splittedRequirements.map(s => {
    return {...s, path: s.path.join('.')};
  });
  const missingRequirements = requirements.filter(
    ({origin}) => origin.length === 0
  );
  if (missingRequirements.length > 0) {
    console.warn(
      `Some requirements are not satisfied \n ${missingRequirements
        .map(({path}) => '- ' + path)
        .join(`\n `)}`
    );
  }
  res.send(requirements);
});

app.get('/resources', (req, res) => {
  res.send(readFile(RESOURCES_PATH));
});

app.listen(PORT, HOST, () => {
  console.log(`${SITE_ID} is running on http://${HOST}:${PORT}`);
});
