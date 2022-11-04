var fs = require("fs"),
  path = require("path"),
  filePathJson = path.join(__dirname, "/assets/template.json");
filePathYaml = path.join(__dirname, "/assets/config.yaml");
const YAML = require("yaml");

const isNestedObject = (property) => {
  return "$ref" in property;
};

const getIdFromRef = (ref) => {
  const r = ref.split("/");
  return r[r.length - 1];
};

function dfs(propertyId, template, config, list) {
  const objInTemplate = template[propertyId];
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
      if (typeof valueC[required] !== "object")
        list.push({
          path: `${keyC}.${required}`,
          value: `${valueC[required]}`,
        });
      //if required === name 'supposed to be generic lol'
    }
  }
  for (const [k, v] of Object.entries(valueC)) {
    const templateRepresentation = objInTemplate.properties[k];
    if (templateRepresentation && isNestedObject(templateRepresentation)) {
      let id = getIdFromRef(templateRepresentation["$ref"]);
      //console.log(id);
      dfs(id, template, [keyC + "." + k, v], list);
    } else if (
      templateRepresentation.items &&
      isNestedObject(templateRepresentation.items)
    ) {
      let id = getIdFromRef(templateRepresentation.items["$ref"]);
      //console.log(id);
      dfs(id, template, [keyC + "." + k, v], list);
    }
  }
}
console.time("exec");
const args = process.argv;

fs.readFile(filePathJson, { encoding: "utf-8" }, function (err, template) {
  if (!err) {
    template = JSON.parse(template).definitions;
    fs.readFile(filePathYaml, { encoding: "utf-8" }, function (err, config) {
      config = YAML.parse(config);
      const root = config.kind;
      let output = [];

      for (const [k, v] of Object.entries(template)) {
        if (v.properties?.kind?.enum) {
          if (v.properties.kind.enum[0] === root) {
            dfs(k, template, [root, config], output);
            /*
            const rootInTemplate = template[k];
            for (const property of Object.entries(config)) {
              const propertyName = property[0];
              const templateProperty = rootInTemplate.properties[propertyName];
              if (isNestedObject(templateProperty)) {
                let id = getIdFromRef(templateProperty["$ref"]);
                dfs(id, template, property, output);
              }
            }
            */
          }
        }
      }
      console.log(output);
      console.timeEnd("exec");
    });
  } else {
    console.log(err);
  }
});
