import * as db from './db';

console.log('🧪 Testing database...\n');

// Initialize database
db.initializeDatabase();

// Check if tables exist
console.log('📋 Checking tables...');
const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);

// Try to cache a test player
console.log('\n💾 Testing cache...');
db.cacheLeague('423.l.12345', 'Test League', '2024', '423');
db.cacheTeam('423.l.12345.t.1', '423.l.12345', 'Test Team', 'mgr_123', 'Test Manager', '2024');
db.cachePlayer('12345', 'Patrick Mahomes', 'QB', 'KC');
db.cacheRosterEntry('423.l.12345.t.1', '12345', '2024');

// Query the data back
console.log('\n📊 Querying cached data...');
const managers = db.getAllManagersWithRosters();
console.log('Managers:', JSON.stringify(managers, null, 2));

console.log('\n✅ Test complete!');
