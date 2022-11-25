/**
 * Generic parsing functions based on the json schema spec.
 **/

const Ajv = require('ajv').default;
const ajv = new Ajv({allErrors: true, strictSchema: false});

require('ajv-errors')(ajv); // Ajv option allErrors is required

/**
 * Check if we need to run a extractListRequirements from this property
 * @param {string} property
 * @returns {boolean} true if is nested, false otherwise
 */
function isNestedObject(property) {
  return '$ref' in property;
}

/**
 * Check if the path contains an array index (index brackets '[_]')
 * @param {string} string
 * @returns true if is array, false otherwise
 */
function isArray(string) {
  return /\[\d+\]/.test(string);
}

/**
 * get index from string, ex: composers[0] returns 0
 * @param {string} string
 * @returns {number} true if is array, false otherwise
 */
function getIndices(string) {
  return string.match(/\[(\d+)\]/)[1];
}

/**
 * Get property id in definitions
 * @param {string} ref
 * @returns {string} found property
 */
function getIdFromRef(ref) {
  const r = ref.split('/');
  return r[r.length - 1];
}

/**
 * Create new object with only required attributes, supports array notation
 * @param {string} path property to edit
 * @param {string} targetObj input object
 * @param {string} value to set at the path
 * @returns {string} object with required attributes
 */
function set(path, targetObj, value) {
  const splitPath = path.split('.');
  let cursor = targetObj;

  for (let i = 0; i < splitPath.length - 1; ++i) {
    const subPath = splitPath[i];

    if (isArray(subPath)) {
      const index = getIndices(subPath);
      const tArrName = subPath.split('[');
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
 * Explore the object with Depth First Search and fill the list passed as parameter
 * with a generated decision tree from the template and config.
 * @param {string} propertyId key in the definitions
 * @param {object} template the definitions
 * @param {object} config [key, value] in the config
 * @param {array} list the decision tree
 * @param {boolean} force optional, force the addition of childs
 */
function extractListRequirements(
  propertyId,
  template,
  config,
  list,
  parentRequired
) {
  const templateObject = template[propertyId];

  // If we already know that a parent is required,
  // we can include all the sub elements
  let forceRequired = parentRequired == null ? false : parentRequired;

  // key in the config and value in the config (yaml)
  const [keyC, valueC] = config;

  // If the current level is an array, we call the dfs on each sub items
  if (Array.isArray(valueC)) {
    for (const [i, v] of valueC?.entries()) {
      const reconstructedPath = `${keyC}[${i}]`;
      extractListRequirements(
        propertyId,
        template,
        [reconstructedPath, v],
        list,
        forceRequired
      );
    }

    return;
  }

  // Otherwise, it's a flat object. We have to check each prop

  // Fields can have multiple ways of being required: defined as so in
  // the template or if the object is at the same level/under a field
  // containing a 'name' property ()

  // Simple way to make sure we don't add field twice at the same level
  let alreadyAdded = new Set([]);

  if (templateObject.required) {
    const hasRequiredName = templateObject.required.find(r => {
      return r.toLowerCase().includes('name');
    });

    if (hasRequiredName) {
      forceRequired = true;
    }

    // We only add the required fields
    for (const required of templateObject.required) {
      if (typeof valueC[required] !== 'object') {
        alreadyAdded.add(required); // Make sure we dont add it twice

        list.push({
          path: `${keyC}.${required}`,
          value: `${valueC[required]}`,
        });
      }
    }
  }

  // We check for each sub field if it is required
  for (const [k, v] of Object.entries(valueC)) {
    let templateRepresentation = templateObject.properties[k];

    // if it's an array, ref is nested inside items
    if (templateRepresentation.type === 'array') {
      templateRepresentation = templateRepresentation.items;
    }

    // If the array was not empty and if the prop is a reference
    // we need to replace it and explore it with the dfs
    if (templateRepresentation && isNestedObject(templateRepresentation)) {
      const reconstructedPath = `${keyC}.${k}`;
      const id = getIdFromRef(templateRepresentation['$ref']);
      extractListRequirements(
        id,
        template,
        [reconstructedPath, v],
        list,
        forceRequired
      );
    } else if (
      // Otherwise, if it's a simple value
      forceRequired && // and in the same level (or sub level) as a required field
      typeof v !== 'object' && // and the prop is a simple field (unreferenced object case)
      k.toLowerCase().includes('name') && // and the key contains name
      !alreadyAdded.has(k) // and we don't already have it
    ) {
      // Then we add it to the list of required fields
      list.push({
        path: `${keyC}.${k}`,
        value: `${v}`,
      });
    }
  }
}

/**
 * Check with sjv if the given config is compliant with the template file
 * Throw an error if the schema is invalid
 * @param {object} schema entry point
 * @param {object} template global definition
 * @param {object} config current user config
 */
function validate(schema, template, config) {
  // For each object, specify manually that additional
  // properties are prohibited to strictly check for
  // matching between config and schema.
  for (const t of Object.values(template)) {
    if (!t.additionalProperties) {
      t.additionalProperties = false;
    }
  }

  // Create a complete schema object for compilation
  const validate = ajv.compile({
    ...schema, // Referencing the entry point at the root
    definitions: template, // and describing each references
  });

  if (!validate(config)) {
    throw new Error(`${JSON.stringify(validate.errors, null, 2)}`);
  }
}

/**
 * Find every required field for a given config and it's template definition.
 * * 1. Find the entry point name with the config kind
 * * 2. Explore recursively the config and the template with the dfs function extractListRequirements()
 * * 3. Reconstruct the output as a list and as a tree
 * @param {object} config
 * @param {object} template
 * @returns {object} output as a list / as a tree
 */
function findRequirements(config, template) {
  // Identify the name of the entry point with config kind
  if (config.kind === undefined) {
    throw new Error('Kind not specified in config');
  }

  // Find the entry point in the json schema
  const root = [...Object.entries(template)].find(([_, v]) => {
    return v.properties?.kind?.enum?.[0] === config.kind;
  });

  // Check if the entry point is valid
  if (!root) {
    throw new Error(`Could not find ${config.kind}`);
  }

  // Check for JSON schema compliancy with ajv
  validate(root[1], template, config);

  // Build the output as a list with the extractListRequirements function
  let list = [];
  extractListRequirements(
    root[0],
    template,
    [config.kind.toLowerCase(), config],
    list
  );

  // Build the output config tree with only required fields
  const tree = {};
  for (const {path, value} of list) {
    set(path, tree, value);
  }

  return {list, tree};
}

/**
 * Fill requirements with the origin for all ressources provided
 * @param { { path: string[], value: string} } requirement
 * @param {any} ressources ressources available in the site
 * @param {string} origin id of the site
 * @param {number} index current position in the path
 * @return {boolean} true if the meets the requirement, false otherwise
 */
function meetsRequirement(requirement, ressources, origin, index = 0) {
  // we have reached the end of the path succefully. To check if the requirement
  // is a ressource, we only have to compare the 'value' and the remaining path.
  if (index >= requirement.path.length) {
    return requirement.value == ressources; // check if it correspond
  }

  let path = requirement.path[index];

  if (isArray(path)) {
    const bracket_index = path.indexOf('[');

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

/**
 * Check for all given requirements if it is availlable in
 * the given ressources and fill the locations with siteId
 * @param {object} requirements
 * @param {object} ressources
 * @param {number} siteId
 */
function checkAllRequirements(requirements, ressources, siteId) {
  for (const requirement of requirements) {
    const requirement_copy = {...requirement};

    // We check if the requirement is in the resource
    if (meetsRequirement(requirement_copy, ressources, siteId)) {
      requirement.origin.push(siteId); // we fill the requirement with the resource origin
    }
  }
}

module.exports = {findRequirements, meetsRequirement, checkAllRequirements};
