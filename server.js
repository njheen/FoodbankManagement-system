const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Database connection before starting the server
db.initialize().then(() => {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
});

// ==========================================
// API ROUTES
// ==========================================

// 1. GET ALL ITEMS (Inventory)
app.get('/api/items', async (req, res) => {
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`SELECT * FROM Item ORDER BY item_ID ASC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 2. ADD A NEW ITEM
app.post('/api/items', async (req, res) => {
    const { item_ID, name, type, stock_quantity } = req.body;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        await connection.execute(
            `INSERT INTO Item (item_ID, name, type, stock_quantity) VALUES (:1, :2, :3, :4)`,
            [item_ID, name, type, stock_quantity]
        );
        res.status(201).json({ message: "Item added successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 3. GET ALL DONORS
app.get('/api/donors', async (req, res) => {
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`SELECT * FROM Donor ORDER BY donor_ID ASC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 4. PROCESS A DONATION
// This maps to your Donation and Donation_Item tables
app.post('/api/donations', async (req, res) => {
    const { donation_ID, donor_ID, item_ID, item_quantity } = req.body;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        
        // Note: In a real system, you'd wrap this in a transaction block
        // Insert into Donation Table
        await connection.execute(
            `INSERT INTO Donation (donation_ID, total_quantity, status, donor_ID) 
             VALUES (:1, :2, 'Processed', :3)`,
            [donation_ID, item_quantity, donor_ID]
        );

        // Insert into Donation_Item Table (Your trigger will auto-update the Item table!)
        await connection.execute(
            `INSERT INTO Donation_Item (donation_item_ID, donation_ID, item_ID, item_quantity) 
             VALUES (:1, :2, :3, :4)`,
            [Date.now() % 1000000, donation_ID, item_ID, item_quantity] // Mocking a unique ID for junction
        );

        res.status(201).json({ message: "Donation processed! Inventory auto-updated." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});