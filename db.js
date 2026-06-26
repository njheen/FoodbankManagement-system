const oracledb = require('oracledb');
require('dotenv').config();

// Format results as JSON objects instead of arrays
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true; // Auto-commit for INSERT/UPDATE/DELETE

async function initialize() {
    try {
        await oracledb.createPool({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING,
            poolMin: 2,
            poolMax: 10,
            poolIncrement: 2
        });
        console.log('Oracle Database Connection Pool Started');
    } catch (err) {
        console.error('Error starting Oracle connection pool:', err);
    }
}

function getPool() {
    return oracledb.getPool();
}

module.exports = { initialize, getPool };