import 'dotenv/config';
import app from './app.js';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on :${PORT}`));
