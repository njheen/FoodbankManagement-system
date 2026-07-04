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

// ==========================================
// INVENTORY & DONATION ASSIGNMENT ROUTES
// ==========================================

// HELPER: GET ALL STAFF FOR DROPDOWNS
app.get('/api/staff/list', async (req, res) => {
    let connection;
    try {
        connection = await db.getPool().getConnection();
        // Fetch staff who can manage things
        const result = await connection.execute(`SELECT staff_ID, name_staff, role FROM Staff WHERE role IN ('Admin', 'Manager', 'Coordinator', 'Staff')`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 1. GET ALL ITEMS (Now joins with Donations and Staff)
app.get('/api/items', async (req, res) => {
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`
            SELECT i.item_ID, i.name, i.type, i.stock_quantity, i.expiry_date, 
                   di.donation_ID, dm.staff_ID, s.name_staff as manager_name
            FROM Item i
            LEFT JOIN Donation_Item di ON i.item_ID = di.item_ID
            LEFT JOIN Donation_Management dm ON di.donation_ID = dm.donation_ID
            LEFT JOIN Staff s ON dm.staff_ID = s.staff_ID
            ORDER BY i.item_ID ASC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 2. GET SINGLE ITEM (For Prefill, including assigned staff)
app.get('/api/items/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`
            SELECT i.*, di.donation_ID, dm.staff_ID
            FROM Item i
            LEFT JOIN Donation_Item di ON i.item_ID = di.item_ID
            LEFT JOIN Donation_Management dm ON di.donation_ID = dm.donation_ID
            WHERE i.item_ID = :1
        `, [id]);
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(404).json({ error: "Item not found" });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 3. ADD BATCH ITEMS & ASSIGN DONATION MANAGER
app.post('/api/items/batch', async (req, res) => {
    const { items, staff_ID } = req.body; 
    let connection;
    try {
        connection = await db.getPool().getConnection();
        
        // Ensure a system Donor exists
        const donorCheck = await connection.execute(`SELECT donor_ID FROM Donor WHERE donor_ID = 1`);
        if (donorCheck.rows.length === 0) {
            await connection.execute(`INSERT INTO Donor (donor_ID, name_donor) VALUES (1, 'System Anonymous Donor')`);
        }
        
        // --- NEW CODE: Calculate the total quantity of all items being added ---
        let total_quantity = 0;
        for (let item of items) {
            total_quantity += parseInt(item.stock_quantity, 10) || 0;
        }
        
        // Create 1 unified Donation ID and insert the TOTAL_QUANTITY
        const donation_ID = Math.floor(Math.random() * 90000) + 10000;
        await connection.execute(
            `INSERT INTO Donation (donation_ID, donor_ID, status, total_quantity) VALUES (:1, 1, 'Pending', :2)`, 
            [donation_ID, total_quantity]
        );
        
        // Assign the Staff Manager to this Donation
        if (staff_ID) {
            const mgmt_ID = Math.floor(Math.random() * 90000) + 10000;
            await connection.execute(`INSERT INTO Donation_Management (management_ID, staff_ID, donation_ID) VALUES (:1, :2, :3)`, [mgmt_ID, staff_ID, donation_ID]);
        }
        
        // Insert Items and link them to the Donation
        for (let item of items) {
            const item_ID = Math.floor(Math.random() * 90000) + 10000;
            const expDate = item.expiry_date ? new Date(item.expiry_date) : null;
            
            await connection.execute(`INSERT INTO Item (item_ID, name, type, stock_quantity, expiry_date) VALUES (:1, :2, :3, :4, :5)`, [item_ID, item.name, item.type, item.stock_quantity, expDate]);
            
            const donItemID = Math.floor(Math.random() * 90000) + 10000;
            await connection.execute(`INSERT INTO Donation_Item (donation_item_ID, donation_ID, item_ID, item_quantity) VALUES (:1, :2, :3, :4)`, [donItemID, donation_ID, item_ID, item.stock_quantity]);
        }
        res.json({ success: true, message: "Donation added and managed successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 4. UPDATE ITEM & REASSIGN STAFF
app.put('/api/items/:id', async (req, res) => {
    const item_ID = parseInt(req.params.id, 10);
    const { name, type, stock_quantity, expiry_date, staff_ID } = req.body;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const expDate = expiry_date ? new Date(expiry_date) : null;
        
        // 1. Update the Item stats
        await connection.execute(`UPDATE Item SET name = :1, type = :2, stock_quantity = :3, expiry_date = :4 WHERE item_ID = :5`, [name, type, stock_quantity, expDate, item_ID]);
        
        // 2. Reassign the Staff (Find the donation, then update management)
        const donItem = await connection.execute(`SELECT donation_ID FROM Donation_Item WHERE item_ID = :1`, [item_ID]);
        if (donItem.rows.length > 0 && staff_ID) {
            const don_ID = donItem.rows[0].DONATION_ID;
            const mgmtCheck = await connection.execute(`SELECT management_ID FROM Donation_Management WHERE donation_ID = :1`, [don_ID]);
            
            if (mgmtCheck.rows.length > 0) {
                await connection.execute(`UPDATE Donation_Management SET staff_ID = :1 WHERE donation_ID = :2`, [staff_ID, don_ID]);
            } else {
                const mgmt_ID = Math.floor(Math.random() * 90000) + 10000;
                await connection.execute(`INSERT INTO Donation_Management (management_ID, staff_ID, donation_ID) VALUES (:1, :2, :3)`, [mgmt_ID, staff_ID, don_ID]);
            }
        }
        res.json({ message: "Item updated successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
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




// ==========================================
// ADMIN: USER MANAGEMENT ROUTES (CRUD)
// ==========================================

// 1. GET ALL STAFF
app.get('/api/admin/staff', async (req, res) => {
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`SELECT * FROM Staff ORDER BY staff_ID ASC`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 2. GET ALL RECIPIENTS
app.get('/api/admin/recipients', async (req, res) => {
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`SELECT * FROM Recipient ORDER BY recipient_ID ASC`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 3. GET SINGLE STAFF (For Prefill)
app.get('/api/admin/staff/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`SELECT * FROM Staff WHERE staff_ID = :1`, [id]);
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(404).json({ error: "Staff not found" });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 4. GET SINGLE RECIPIENT (For Prefill)
app.get('/api/admin/recipients/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    let connection;
    try {
        connection = await db.getPool().getConnection();
        const result = await connection.execute(`SELECT * FROM Recipient WHERE recipient_ID = :1`, [id]);
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.status(404).json({ error: "Recipient not found" });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 5. UPDATE STAFF
app.put('/api/admin/staff/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, role, contact } = req.body;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        await connection.execute(
            `UPDATE Staff SET name_staff = :1, role = :2, contact_staff = :3 WHERE staff_ID = :4`,
            [name, role, contact, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 6. UPDATE RECIPIENT
app.put('/api/admin/recipients/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, type, contact } = req.body;
    let connection;
    try {
        connection = await db.getPool().getConnection();
        await connection.execute(
            `UPDATE Recipient SET name_recipient = :1, type = :2, contact_recipient = :3 WHERE recipient_ID = :4`,
            [name, type, contact, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (connection) await connection.close(); }
});

// 7. DELETE STAFF
app.delete('/api/admin/staff/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    let connection;
    try {
        connection = await db.getPool().getConnection();
        await connection.execute(`DELETE FROM Staff WHERE staff_ID = :1`, [id]);
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: "Cannot delete staff. They may be linked to a donation." }); 
    }
    finally { if (connection) await connection.close(); }
});

// 8. DELETE RECIPIENT
app.delete('/api/admin/recipients/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    let connection;
    try {
        connection = await db.getPool().getConnection();
        await connection.execute(`DELETE FROM Recipient WHERE recipient_ID = :1`, [id]);
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: "Cannot delete recipient. They may be linked to a record." }); 
    }
    finally { if (connection) await connection.close(); }
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


// REGISTER A NEW STAFF (ADMIN ONLY)
app.post('/api/register/staff', async (req, res) => {
    const { name, role, contact } = req.body;
    
    // Generate a random 5-digit staff_ID
    const staff_ID = Math.floor(Math.random() * 90000) + 10000; 
    
    let connection;
    try {
        connection = await db.getPool().getConnection();
        
        await connection.execute(
            `INSERT INTO Staff (staff_ID, name_staff, role, contact_staff) VALUES (:1, :2, :3, :4)`,
            [staff_ID, name, role, contact]
        );
        
        res.json({ 
            success: true, 
            assigned_ID: staff_ID, 
            message: "Staff registered successfully!" 
        });
    } catch (err) {
        console.error("Staff Registration Error:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});





