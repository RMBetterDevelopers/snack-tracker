-- Separate database for Vitest data-access tests (TEST_DATABASE_URL).
-- Runs only when the Postgres volume is created for the first time.
CREATE DATABASE snack_tracker_test;
