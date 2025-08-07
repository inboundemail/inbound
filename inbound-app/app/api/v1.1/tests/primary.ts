import { config } from 'dotenv'


config()


const BASE_URL = 'http://localhost:3000'
const API_KEY = process.env.INBOUND_API_KEY
const BASE_DOMAIN = 'inbound.run'
console.log("API KEY: " + API_KEY)


async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${BASE_URL}${endpoint}`
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        ...options.headers
    }

    const response = await fetch(url, {
        ...options,
        headers
    })

    const data = await response.json()
    return { response, data }
}

console.log("================")
console.log("Checking Domains that are available")
console.log("================")

const { response, data } = await apiRequest('/api/v1.1/domains')
console.log(data)