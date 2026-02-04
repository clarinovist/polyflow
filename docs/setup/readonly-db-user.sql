-- Instructions: Run this as a superuser (postgres) on your database
-- 1. Create the user
CREATE USER polyflow_readonly WITH PASSWORD 'secure_readonly_password_change_me';

-- 2. Grant connect permission to the database
GRANT CONNECT ON DATABASE "your_database_name" TO polyflow_readonly;

-- 3. Connect to the database and grant schema usage
\c "your_database_name"
GRANT USAGE ON SCHEMA public TO polyflow_readonly;

-- 4. Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO polyflow_readonly;

-- 5. Ensure future tables are also readable
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO polyflow_readonly;

-- 6. Add the connection string to your .env file
-- DATABASE_URL_READONLY="postgresql://polyflow_readonly:secure_readonly_password_change_me@localhost:5432/your_database_name"
