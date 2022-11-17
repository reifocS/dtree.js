var fs = require("fs"),
  path = require("path"),
  filePathJson = path.join(__dirname, "/assets/template.json");
filePathYaml = path.join(__dirname, "/assets/test.yaml");
const YAML = require("yaml");
var { performance } = require("perf_hooks");

const isNestedObject = (property) => {
  return "$ref" in property;
};

function set(path, targetObj, value) {
  const splitPath = path.split(".");
  let cursor = targetObj;
  for (let i = 0; i < splitPath.length - 1; ++i) {
    const subPath = splitPath[i];
    if (isArray(subPath)) {
      const index = getIndices(subPath);
      const tArrName = subPath.split("[");
      const arrName = tArrName[0];
      if (!cursor[arrName]) {
        cursor[arrName] = [];
      }
      if (cursor[arrName][index]) {
        cursor = cursor[arrName][index];
      } else {
        cursor[arrName][index] = {};
        cursor = cursor[arrName][index];
      }
    } else {
      cursor = cursor[subPath] = cursor[subPath] || {};
    }
  }
  return (cursor[splitPath[splitPath.length - 1]] = value);
}

const isArray = (string) => {
  return /\[\d+\]/.test(string);
};

const getIndices = (string) => {
  return string.match(/\[(\d+)\]/)[1];
};

const getIdFromRef = (ref) => {
  const r = ref.split("/");
  return r[r.length - 1];
};

function validate(propertyId, template, config) {
  const objInTemplate = template[propertyId];
  const [keyConfig, valueConfig] = config;
  if (!objInTemplate) {
    throw new Error(`${propertyId} does not exist in definitions`);
  }
  if (isNestedObject(objInTemplate)) {
    //console.log(propertyId);
    if (typeof valueConfig !== "object") {
      throw new Error(
        `invalid type for property ${propertyId}, expected object and got ${typeof valueConfig}`
      );
    }
  } else if (objInTemplate.type) {
    const typeInConfig = Array.isArray(valueConfig)
      ? "array"
      : typeof valueConfig;
    if (typeInConfig !== objInTemplate.type) {
      if (objInTemplate.type === "integer") {
        if (isNaN(+valueConfig)) {
          // numbers are converted to string during json parsing
          throw new Error(
            `invalid type for property ${propertyId}, expected ${objInTemplate.type} and got ${typeInConfig} ${valueConfig}`
          );
        }
      } else {
        throw new Error(
          `invalid type for property ${propertyId}, expected ${objInTemplate.type} and got ${typeInConfig}`
        );
      }
    }
  }
}

/**
 *
 * @param {*} propertyId key in the definitions
 * @param {*} template the definitions
 * @param {*} config [key, value] in the config
 * @param {*} list the decision tree
 * @returns
 */
function dfs(propertyId, template, config, list) {
  const objInTemplate = template[propertyId];
  //key in the config and value in the config (yaml)
  const [keyC, valueC] = config;
  if (Array.isArray(valueC)) {
    let i = 0;
    for (const v of valueC) {
      validate(propertyId, template, [keyC + "[" + i + "]", v]);
      dfs(propertyId, template, [keyC + "[" + i + "]", v], list);
      ++i;
    }
    return;
  }
  validate(propertyId, template, config);
  if (objInTemplate.required) {
    for (const required of objInTemplate.required) {
      //console.log(propertyId + "." + required + ":" + objInTemplate.properties[required].type);
      if (typeof valueC[required] !== "object") {
        list.push({
          path: `${keyC}.${required}`,
          value: `${valueC[required]}`,
        });
      }
    }
  }
  for (const [k, v] of Object.entries(valueC)) {
    validate(k, objInTemplate.properties, [k, v]);
    let templateRepresentation = objInTemplate.properties[k];
    //if it's an array, ref is nested inside items
    if (templateRepresentation.type === "array")
      templateRepresentation = templateRepresentation.items;
    if (templateRepresentation && isNestedObject(templateRepresentation)) {
      let id = getIdFromRef(templateRepresentation["$ref"]);
      dfs(id, template, [keyC + "." + k, v], list);
    }
  }
}

const readFiles = () => {
  let templateFile = fs.readFileSync(filePathJson, {
    encoding: "utf-8",
    flag: "r",
  });
  let template = JSON.parse(templateFile).definitions;
  let configFile = fs.readFileSync(filePathYaml, {
    encoding: "utf-8",
    flag: "r",
  });
  let config = YAML.parse(configFile);
  return { config, template };
};

const PASS = 1;
const passes = Array(PASS)
  .fill(0)
  .map(() => {
    const start = performance.now();
    const { config, template } = readFiles();

    const root = config.kind;
    let output = [];

    //Find the entry point in the json schema
    for (const [k, v] of Object.entries(template)) {
      if (v.properties?.kind?.enum) {
        if (v.properties.kind.enum[0] === root) {
          dfs(k, template, [root.toLowerCase(), config], output);
          break;
        }
      }
    }

    //Build the output config with only required fields
    const dObj = {};
    for (const { path, value } of output) {
      // console.log(eval(path));
      set(path, dObj, value);
    }
    console.log(output);
    console.log(YAML.stringify(dObj[root.toLowerCase()]));
    const end = performance.now();

    const time = end - start;
    return time;
  });

const sum = passes.reduce((a, b) => a + b, 0);
console.log(`
==========================================
total duration: ${sum}ms
mean duration: ${sum / PASS}ms
max duration: ${Math.max(...passes)}ms
min duration: ${Math.min(...passes)}ms
==========================================
`);
