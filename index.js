var fs = require("fs"),
  path = require("path"),
  filePathJson = path.join(__dirname, "/assets/template.json");
filePathYaml = path.join(__dirname, "/assets/config.yaml");
const YAML = require("yaml");
var { performance } = require("perf_hooks");

const isNestedObject = (property) => {
  return "$ref" in property;
};

const getIdFromRef = (ref) => {
  const r = ref.split("/");
  return r[r.length - 1];
};
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
      dfs(propertyId, template, [keyC + "[" + i + "]", v], list);
      ++i;
    }
    return;
  }
  if (objInTemplate.required) {

    for (const required of objInTemplate.required) {
      //console.log(propertyId + "." + required + ":" + objInTemplate.properties[required].type);
      if (typeof valueC[required] !== "object") {
        list.push({
          path: `${keyC}.${required}`,
          value: `${valueC[required]}`,
        });
      }
      //TODO if required === name 'supposed to be generic lol'
    }
  }
  for (const [k, v] of Object.entries(valueC)) {
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

const PASS = 1;
const passes = Array(PASS)
  .fill(0)
  .map(() => {
    const start = performance.now();

    let template = fs.readFileSync(filePathJson, {
      encoding: "utf-8",
      flag: "r",
    });
    template = JSON.parse(template).definitions;
    let config = fs.readFileSync(filePathYaml, {
      encoding: "utf-8",
      flag: "r",
    });
    config = YAML.parse(config);
    const root = config.kind;
    let output = [];

    //Find the entry point in the json schema
    for (const [k, v] of Object.entries(template)) {
      if (v.properties?.kind?.enum) {
        if (v.properties.kind.enum[0] === root) {
          dfs(k, template, [root, config], output);
          break;
        }
      }
    }
    console.log(output);
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
