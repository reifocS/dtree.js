const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
dotenv.config();

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const SITE_ID = process.env.SITE_ID || "Defaut";
const RESOURCES_PATH = path.join(
  __dirname,
  process.env.RESOURCES_PATH || "./resources/resources_A.json"
);

const express = require("express");
const app = express();

/**
 * Wrapper around fs.readFile with error handling
 * @param {string} location of the file to read
 * @returns data from the file
 */
function readFile(location) {
  try {
    return fs.readFileSync(location, "utf8");
  } catch (error) {
    throw new Error(
      `An error occured while trying to read the ${location} file (${error}).`
    );
  }
}

app.get("/", (req, res) => {
  res.send(readFile(RESOURCES_PATH));
});

app.listen(PORT, HOST, () => {
  console.log(`${SITE_ID} is running on http://${HOST}:${PORT}`);
});
