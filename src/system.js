const fs = require("fs");
const path = require("path");

/**
 * Wrapper around fs.readFile with error handling
 * @param {string} location of the file to read
 * @returns data from the file
 */
function readFile(location) {
  try {
    return fs.readFileSync(location, "utf8");
  }
  catch (error) {
    throw new Error(`An error occured while trying to read the ${location} file (${error}).`);
  }
}

/**
 * Wrapper around fs.copyFile with error handling
 * @param {string} source of the file to copy
 * @param {string} destination of the file to copy
 */
function copyFile(source, destination) {
  try {
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE);
  }
  catch (error) {
    throw new Error(`An error occured while trying to copy the ${source} file(${error}).`);
  }
}

/**
 * Wrapper around fs.readdir with error handling
 * @param {string} location of the directory to read
 * @returns the list of files/dirs in the dir
 */
function listFiles(location) {
  try {
    return fs.readdirSync(location, "utf8");
  }
  catch (error) {
    throw new Error(`An error occured while trying to read the files in ${location} (${error}).`);
  }
}

/**
 * Wrapper around fs.mkdir with error handling
 * @param {string} location of a file/directory to create
 */
function createDir(location) {
  const dirname = path.dirname(location);

  try {
    fs.mkdirSync(dirname, { recursive: true });
  }
  catch (error) {
    throw new Error(`An error occured while trying to create the ${location} directory(${error}).`);
  }
}

/**
 * Wrapper around fs.writeFile with error handling
 * @param {string} location of the file to write
 * @param {string} data of the file to write
 */
function writeFile(location, data) {
  try {
    fs.writeFileSync(location, data);
  }
  catch (error) {
    throw new Error(`An error occured while trying to write in ${location} (${error}).`);
  }
}


/**
 * Wrapper around fs.extname with error handling
 * @param {string} location file/folder to test
 * @returns {boolean} true if directory, false otherwise
 */
function isDirectory(location) {
  try {
    return !path.extname(location);
  }
  catch (error) {
    throw new Error(`An error occured while trying to read ${location} (${error}).`);
  }
}

/**
 * Check if a path is equal to the current directory
 * @param {string} location to be compared with the current directory
 * @returns true if equal to the current directory, otherwise false
 */
function isCurrent(location) {
  try {
    return path.resolve(path.dirname(location)) !== path.resolve(".");
  }
  catch (error) {
    throw new Error(`An error occured while trying resolve ${location} path (${error}).`);
  }

}

module.exports = { readFile, copyFile, isCurrent, isDirectory, writeFile, createDir, listFiles };
