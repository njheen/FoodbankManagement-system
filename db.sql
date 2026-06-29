-- this is the database script for the Donation Management System
-- copy these into the dbms, oracle sql developer 26 ai free idk
-- database name: ProjectDB
-- username: project
-- password: project123
-- port: 1521
-- service name: FREEPDB1

-- =======================================================
-- 1. CLEANUP (Drop tables & sequences to prevent ORA-00955)
-- =======================================================
DROP TABLE Donation_Management CASCADE CONSTRAINTS;
DROP TABLE Donation_Item CASCADE CONSTRAINTS; 
DROP TABLE Donation CASCADE CONSTRAINTS;
DROP TABLE Donor CASCADE CONSTRAINTS;
DROP TABLE Recipient CASCADE CONSTRAINTS;
DROP TABLE Item CASCADE CONSTRAINTS;
DROP TABLE Staff CASCADE CONSTRAINTS;


-- =======================================================
-- 2. CREATE PARENT TABLES (No Foreign Keys)
-- =======================================================

CREATE TABLE Donor (
    donor_ID INT PRIMARY KEY,
    name_donor VARCHAR2(100) NOT NULL,
    phone VARCHAR2(15),
    email VARCHAR2(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Audit Trail
);

CREATE TABLE Recipient (
    recipient_ID INT PRIMARY KEY,
    name_recipient VARCHAR2(100) NOT NULL,
    type VARCHAR2(50) NOT NULL,
    contact_recipient VARCHAR2(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Audit Trail
);

CREATE TABLE Item (
    item_ID INT PRIMARY KEY,
    name VARCHAR2(100) NOT NULL,
    type VARCHAR2(100) NOT NULL,
    stock_quantity INT DEFAULT 0 NOT NULL,
    expiry_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Validation: Inventory cannot drop below zero
    CONSTRAINT chk_stock_positive CHECK (stock_quantity >= 0) 
);

CREATE TABLE Staff (
    staff_ID INT PRIMARY KEY,
    name_staff VARCHAR2(100) NOT NULL,
    role VARCHAR2(50) NOT NULL,
    contact_staff VARCHAR2(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =======================================================
-- 3. CREATE DEPENDENT TABLES (With Foreign Keys)
-- =======================================================

CREATE TABLE Donation (
    donation_ID INT PRIMARY KEY,
    "date" DATE DEFAULT SYSDATE NOT NULL, 
    total_quantity INT NOT NULL, 
    status VARCHAR2(50) DEFAULT 'Pending' NOT NULL, 
    donor_ID INT NOT NULL,
    recipient_ID INT, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Validation: Only allow specific text for status
    CONSTRAINT chk_status CHECK (status IN ('Pending', 'Processed', 'Distributed', 'Rejected')),
    
    FOREIGN KEY (donor_ID) REFERENCES Donor(donor_ID),
    FOREIGN KEY (recipient_ID) REFERENCES Recipient(recipient_ID)
);

-- THE NEW JUNCTION TABLE (Solves the 1-to-1 Item flaw)
CREATE TABLE Donation_Item (
    donation_item_ID INT PRIMARY KEY, 
    donation_ID INT NOT NULL,
    item_ID INT NOT NULL,
    item_quantity INT NOT NULL,
    
    -- Validation: You cannot donate 0 or negative items
    CONSTRAINT chk_item_quantity CHECK (item_quantity > 0),
    
    FOREIGN KEY (donation_ID) REFERENCES Donation(donation_ID),
    FOREIGN KEY (item_ID) REFERENCES Item(item_ID)
);

CREATE TABLE Donation_Management (
    management_ID INT PRIMARY KEY,
    staff_ID INT NOT NULL,
    donation_ID INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (staff_ID) REFERENCES Staff(staff_ID),
    FOREIGN KEY (donation_ID) REFERENCES Donation(donation_ID)
);


-- =======================================================
-- 4. PERFORMANCE OPTIMIZATION (Indexes)
-- =======================================================
-- These speed up searches for dates, names, and statuses

CREATE INDEX idx_donation_date ON Donation("date");
CREATE INDEX idx_donation_status ON Donation(status);
CREATE INDEX idx_donor_name ON Donor(name_donor);


-- =======================================================
-- 5. AUTOMATION (Triggers)
-- =======================================================
-- Automatically update Item stock when a new donation is processed

CREATE OR REPLACE TRIGGER trg_update_inventory
AFTER INSERT ON Donation_Item
FOR EACH ROW
BEGIN
    UPDATE Item
    SET stock_quantity = stock_quantity + :NEW.item_quantity
    WHERE item_ID = :NEW.item_ID;
END;
/


-- dummy data for testing purposes

-- Insert dummy data into Staff table
INSERT INTO Staff (staff_ID, name_staff, role, contact_staff) 
VALUES (101, 'Najihen', 'Admin', 'alice.smith@example.com');

INSERT INTO Staff (staff_ID, name_staff, role, contact_staff) 
VALUES (102, 'Akif', 'Coordinator', '555-0123');

INSERT INTO Staff (staff_ID, name_staff, role, contact_staff) 
VALUES (103, 'Harith', 'Volunteer', 'charlie.b@example.com');

INSERT INTO Staff (staff_ID, name_staff, role, contact_staff) 
VALUES (104, 'Hilmi', 'Manager', '555-0199');

-- Commit the transaction to save changes
COMMIT;