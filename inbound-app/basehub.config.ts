import { setGlobalConfig } from 'basehub';

setGlobalConfig({
  // You need to add your Basehub API key and repository information here
  // Get these from your Basehub dashboard
  token: process.env.BASEHUB_TOKEN,
  // repository: 'your-repository-name', // Optional if using token
})
