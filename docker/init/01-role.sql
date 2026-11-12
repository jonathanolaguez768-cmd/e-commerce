-- Create the application role
CREATE ROLE cetiverso_app WITH LOGIN PASSWORD 'cetiverso2026';

GRANT ALL PRIVILEGES ON DATABASE cetiverso TO cetiverso_app;
