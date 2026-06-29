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

// ==========================================
// NEW API ROUTES (CRUD & AUTH)
// ==========================================

// --- INVENTORY CRUD EXTRAS ---


// GET A SINGLE ITEM (For pre-filling the edit page)
app.get('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`SELECT * FROM Item WHERE item_ID = :1`, [id]);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: "Item not found" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});


// UPDATE AN ITEM (PUT)
app.put('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type, stock_quantity, expiry_date } = req.body;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        // Convert string to Date object for Oracle, or set to null if blank
        const expDate = expiry_date ? new Date(expiry_date) : null; 
        
        await connection.execute(
            `UPDATE Item SET name = :1, type = :2, stock_quantity = :3, expiry_date = :4 WHERE item_ID = :5`,
            [name, type, stock_quantity, expDate, id]
        );
        res.json({ message: "Item updated successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// DELETE AN ITEM (DELETE)
app.delete('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        await connection.execute(`DELETE FROM Item WHERE item_ID = :1`, [id]);
        res.json({ message: "Item deleted successfully!" });
    } catch (err) {
        // Will throw an error if the item is linked to a Donation (Foreign Key constraint)
        res.status(500).json({ error: "Cannot delete item. It may be linked to an existing donation." });
    } finally {
        if (connection) await connection.close();
    }
});


// --- AUTHENTICATION & REGISTRATION ---

// UNIFIED LOGIN (Staff & Recipient)
app.post('/api/login', async (req, res) => {
    const { login_ID, role } = req.body;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        let result;
        
        if (role === 'Staff') {
            result = await connection.execute(`SELECT * FROM Staff WHERE staff_ID = :1`, [login_ID]);
        } else if (role === 'Recipient') {
            result = await connection.execute(`SELECT * FROM Recipient WHERE recipient_ID = :1`, [login_ID]);
        }

        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0], role: role });
        } else {
            res.status(401).json({ success: false, error: "Invalid ID or Role not found." });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// REGISTER A NEW RECIPIENT
app.post('/api/register/recipient', async (req, res) => {
    const { name, type, contact } = req.body;
    const recipient_ID = Math.floor(Math.random() * 90000) + 10000; // Generate a random 5-digit ID
    let connection;
    try {
        connection = await db.getPool().getConnection();
        await connection.execute(
            `INSERT INTO Recipient (recipient_ID, name_recipient, type, contact_recipient) VALUES (:1, :2, :3, :4)`,
            [recipient_ID, name, type, contact]
        );
        res.status(201).json({ message: "Registration successful!", assigned_ID: recipient_ID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});


// ADD MULTIPLE ITEMS AT ONCE (Batch Insert)
app.post('/api/items/batch', async (req, res) => {
    const { items } = req.body; // Expects an array of items from the frontend
    let connection;
    try {
        connection = await db.getPool().getConnection();
        
        // Loop through the array and insert each item
        for (let item of items) {
            // Generate a random 5-digit item_ID (similar to how Recipient IDs are handled)
            const item_ID = Math.floor(Math.random() * 90000) + 10000;
            const expDate = item.expiry_date ? new Date(item.expiry_date) : null; 
            
            await connection.execute(
                `INSERT INTO Item (item_ID, name, type, stock_quantity, expiry_date) VALUES (:1, :2, :3, :4, :5)`,
                [item_ID, item.name, item.type, item.stock_quantity, expDate]
            );
        }
        
        res.json({ success: true, message: "All items added successfully!" });
    } catch (err) {
        console.error("Batch Insert Error:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});



