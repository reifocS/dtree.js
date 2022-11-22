/**
 * Generic parsing functions based on the json schema spec.
 **/

const Ajv = require("ajv").default;
const ajv = new Ajv({ allErrors: true, strictSchema: false });
// Ajv option allErrors is required
require("ajv-errors")(ajv /*, {singleError: true} */);

/**
 * Check if we need to run a dfs from this property
 */
function isNestedObject(property) {
  return "$ref" in property;
}

/**
 *
 */
function isArray(string) {
  return /\[\d+\]/.test(string);
}

/**
 * get index from string, ex: composers[0] returns 0
 */
function getIndices(string) {
  return string.match(/\[(\d+)\]/)[1];
}

/**
 * Get property id in definitions
 */
function getIdFromRef(ref) {
  const r = ref.split("/");
  return r[r.length - 1];
}

/**
 * Create new object with only required attributes, supports array notation
 */
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

/**
 *
 * @param {*} propertyId key in the definitions
 * @param {*} template the definitions
 * @param {*} config [key, value] in the config
 * @param {*} list the decision tree
 * @returns
 */
function dfs(propertyId, template, config, list, force = false) {
  const objInTemplate = template[propertyId];
  let mustForce = force;
  //key in the config and value in the config (yaml)
  const [keyC, valueC] = config;
  if (Array.isArray(valueC)) {
    let i = 0;
    for (const v of valueC) {
      dfs(propertyId, template, [keyC + "[" + i + "]", v], list, mustForce);
      ++i;
    }
    return;
  }

  if (objInTemplate.required) {
    const hasRequiredName = objInTemplate.required.find((r) => r === "name");
    if (hasRequiredName) {
      mustForce = true;
    } else if (!mustForce) {
      //We only add the required fields
      for (const required of objInTemplate.required) {
        if (typeof valueC[required] !== "object") {
          list.push({
            path: `${keyC}.${required}`,
            value: `${valueC[required]}`,
          });
        }
      }
    }
  }

  for (const [k, v] of Object.entries(valueC)) {
    let templateRepresentation = objInTemplate.properties[k];
    //if it's an array, ref is nested inside items
    if (templateRepresentation.type === "array")
      templateRepresentation = templateRepresentation.items;
    if (templateRepresentation && isNestedObject(templateRepresentation)) {
      let id = getIdFromRef(templateRepresentation["$ref"]);
      dfs(id, template, [keyC + "." + k, v], list, mustForce);
    } else if (mustForce && typeof v !== "object") {
      // If it's a simple value at the same level of a required name field, we had it.
      //TODO fix for io.k8s.api.core.v1.ResourceRequirements ?
      list.push({
        path: `${keyC}.${k}`,
        value: `${v}`,
      });
    }
  }
}

/**
 *
 * @param {*} config
 * @param {*} template
 * @returns
 */
function findRequirements(config, template) {
  // Identify entry point name with config kind
  if (config.kind === undefined) {
    throw new Error("Kind not specified in config");
  }

  // Find the entry point in the json schema
  const root = [...Object.entries(template)].find(([_, v]) => {
    return v.properties?.kind?.enum?.[0] === config.kind;
  });

  if (!root) {
    throw new Error(`Could not find ${config.kind}`);
  }
  // Check for JSON schema compliancy
  for (const t of Object.values(template)) {
    if (!t.additionalProperties) {
      t.additionalProperties = false;
    }
  }

  const validate = ajv.compile({
    ...root[1],
    definitions: template,
  });

  if (!validate(config)) {
    throw new Error(`${validate.errors[0].instancePath}:${
      validate.errors[0].message
    }
      ${JSON.stringify(validate.errors, null, 2)}`);
  }

  let output = [];
  dfs(root[0], template, [config.kind.toLowerCase(), config], output);

  // Build the output config with only required fields
  const dObj = {};
  for (const { path, value } of output) {
    set(path, dObj, value);
  }

  // console.log(yaml.stringify(dObj[root.toLowerCase()]))
  return { outputAsList: output, outputAsTree: dObj };
}

/**
 * Fill requirements with the origin for all ressources provided
 * @param { { path: string[], value: string} } requirement
 * @param {any} ressources ressources available in the site
 * @param {string} origin id of the site
 * @param {number} index current position in the path
 * @return {boolean}
 */
function meetsRequirement(requirement, ressources, origin, index = 0) {
  // we have reached the end of the path succefully. To check if the requirement
  // is a ressource, we only have to compare the 'value' and the remaining path.
  if (index >= requirement.path.length) {
    return requirement.value == ressources; // check if it correspond
  }

  let path = requirement.path[index];

  if (isArray(path)) {
    const bracket_index = path.indexOf("[");

    if (bracket_index >= 0) {
      // We remove the array index from the path as it is
      // not related to the ressources potential index
      path = path.substring(0, bracket_index); // we keep only the array name
    }
    // now, we need to find the real index of the ressource
    // we can call this function for each sub index of ressources
    if (ressources[path] === undefined) return false;
    // We dive in because arrays are defined in path as arr[0] and not arr.[0]
    ressources = ressources[path];
    for (const item of ressources) {
      if (meetsRequirement(requirement, item, origin, index + 1)) {
        return true;
      }
    }
  } else {
    if (!ressources[path]) {
      return false; // the requirement was not in the ressources, we don't do anything
    }

    return meetsRequirement(requirement, ressources[path], origin, index + 1);
  }

  return false;
}

module.exports = { findRequirements, meetsRequirement };
