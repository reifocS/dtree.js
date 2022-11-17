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
 * Create new object with only required attributes
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
 */
function validate(propertyId, template, config) {
  const objInTemplate = template[propertyId];
  const [, valueConfig] = config;

  if (!objInTemplate) {
    throw new Error(`${propertyId} does not exist in definitions`);
  }

  if (isNestedObject(objInTemplate)) {
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
      if (objInTemplate.type === "integer" && typeInConfig === "number") {
        return;
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

/**
 *
 */
function findRequirements(config, template) {
  const root = config.kind;
  if (root === undefined) {
    throw new Error("Kind not specified in config");
  }

  let output = [];
  let foundRoot = false;

  // Find the entry point in the json schema
  for (const [k, v] of Object.entries(template)) {
    if (v.properties?.kind?.enum) {
      if (v.properties.kind.enum[0] === root) {
        dfs(k, template, [root.toLowerCase(), config], output);
        foundRoot = true;
        break;
      }
    }
  }

  if (!foundRoot) {
    throw new Error(`Could not find ${root}`);
  }

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
 * @param {any} ressources
 * @param {string} origin
 *
 * @return {boolean}
 */
function meetsRequirement(requirement, ressources, origin) {
  // we have reached the end of the path succefully. To check if the requirement
  // is a ressource, we only have to compare the 'value' and the remaining path.
  if (!requirement.path.length) {
    return requirement.value == ressources; // check if it correspond
  }

  let path = requirement.path.shift();

  if (isArray(ressources)) {
    // We remove the array index from the path as it is
    // not related to the ressources potential index
    const bracket_index = path.indexOf("[");

    if (bracket_index < 0) {
      throw new Error(`TODO`);
    }

    path = path.substring(0, bracket_index); // we keep only the array name

    // now, we need to find the real index of the ressource
    // we can call this function for each sub index of ressources

    for (const item of ressources) {
      if (meetsRequirement(requirement, item, origin)) {
        return true;
      }
    }
  } else {
    if (!ressources[path]) {
      return false; // the requirement was not in the ressources, we don't do anything
    }

    return meetsRequirement(requirement, ressources[path], origin);
  }

  return false;
}

module.exports = { findRequirements, meetsRequirement };
