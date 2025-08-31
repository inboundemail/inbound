/**
 * Pull command - Generate configuration from current Inbound state
 */

import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { loadAuth, createClient, validateAuth } from '../auth.js'
import { fetchCurrentState } from '../state.js'
import { generateExampleConfig } from '../config.js'
import type { CLIOptions, InboundConfig } from '../types.js'

export async function pullCommand(options: CLIOptions): Promise<void> {
  console.log(chalk.bold.blue('📥 Inbound Kit - Pull Configuration\n'))

  try {
    // Load authentication
    const auth = loadAuth(options)
    
    // Validate authentication
    const spinner = ora('Validating authentication...').start()
    const isValid = await validateAuth(auth)
    if (!isValid) {
      spinner.fail('Authentication failed')
      process.exit(1)
    }
    spinner.succeed('Authentication validated')

    // Create SDK client
    const client = await createClient(auth)

    // Fetch current state
    const currentState = await fetchCurrentState(client)

    // Convert state to configuration format
    console.log(chalk.blue('🔄 Converting state to configuration format...'))
    
    const config: InboundConfig = {
      emailAddresses: {},
      domains: {},
      endpoints: {}
    }

    // Convert email addresses
    for (const [address, emailState] of Object.entries(currentState.emailAddresses)) {
      if (emailState.endpointId && currentState.endpoints[emailState.endpointId]) {
        const endpoint = currentState.endpoints[emailState.endpointId]
        config.emailAddresses[address] = convertEndpointToShorthand(endpoint)
      } else {
        // No endpoint configured
        config.emailAddresses[address] = "https://example.com/webhook" // Placeholder
      }
    }

    // Convert domains (catch-all settings)
    for (const [domain, domainState] of Object.entries(currentState.domains)) {
      if (domainState.isCatchAllEnabled && domainState.catchAllEndpointId) {
        const endpoint = currentState.endpoints[domainState.catchAllEndpointId]
        config.domains![domain] = {
          catchAll: endpoint ? convertEndpointToShorthand(endpoint) : false
        }
      } else {
        config.domains![domain] = {
          catchAll: false
        }
      }
    }

    // Determine output file format
    let outputFormat: 'typescript' | 'javascript' | 'json' = 'typescript'
    let outputFile = 'inbound.config.ts'

    // Check if config file already exists and determine format
    const existingFiles = [
      { file: 'inbound.config.ts', format: 'typescript' as const },
      { file: 'inbound.config.js', format: 'javascript' as const },
      { file: 'inbound.config.mjs', format: 'javascript' as const },
      { file: 'inbound.config.json', format: 'json' as const }
    ]

    const existingFile = existingFiles.find(({ file }) => existsSync(resolve(process.cwd(), file)))
    
    if (existingFile) {
      outputFormat = existingFile.format
      outputFile = existingFile.file
      
      // Ask for confirmation to overwrite
      if (!options.force) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Configuration file ${outputFile} already exists. Overwrite?`,
            default: false
          }
        ])

        if (!overwrite) {
          console.log(chalk.yellow('❌ Operation cancelled'))
          return
        }
      }
    } else {
      // Ask for output format
      if (!options.force) {
        const { format } = await inquirer.prompt([
          {
            type: 'list',
            name: 'format',
            message: 'Choose configuration file format:',
            choices: [
              { name: 'TypeScript (inbound.config.ts)', value: 'typescript' },
              { name: 'JavaScript (inbound.config.js)', value: 'javascript' },
              { name: 'JSON (inbound.config.json)', value: 'json' }
            ],
            default: 'typescript'
          }
        ])

        outputFormat = format
        outputFile = format === 'typescript' ? 'inbound.config.ts' : 
                    format === 'javascript' ? 'inbound.config.js' : 
                    'inbound.config.json'
      }
    }

    // Generate configuration content
    const configContent = generateConfigContent(config, outputFormat)

    // Write configuration file (unless dry run)
    if (options.dryRun) {
      console.log(chalk.blue('\n🔍 Dry run mode - configuration would be written to:'), outputFile)
      console.log(chalk.gray('\nGenerated configuration:'))
      console.log(configContent)
      return
    }

    const outputPath = resolve(process.cwd(), outputFile)
    writeFileSync(outputPath, configContent, 'utf-8')

    console.log(chalk.green(`✅ Configuration pulled and saved to ${outputFile}`))
    
    // Summary
    const emailCount = Object.keys(config.emailAddresses).length
    const domainCount = Object.keys(config.domains || {}).length
    const endpointCount = Object.keys(currentState.endpoints).length
    
    console.log(chalk.gray(`Summary: ${emailCount} email addresses, ${domainCount} domains, ${endpointCount} endpoints`))

    if (emailCount === 0) {
      console.log(chalk.yellow('\n💡 No email addresses found. You may want to add some to your Inbound account first.'))
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Pull failed:'), error instanceof Error ? error.message : 'Unknown error')
    
    if (options.verbose) {
      console.error(chalk.gray('\nStack trace:'))
      console.error(error)
    }
    
    process.exit(1)
  }
}

/**
 * Convert endpoint state to shorthand configuration
 */
function convertEndpointToShorthand(endpoint: any): any {
  switch (endpoint.type) {
    case 'webhook':
      return endpoint.config.url
    
    case 'email':
      return { forward: endpoint.config.email }
    
    case 'email_group':
      return endpoint.config.emails || []
    
    case 'slack':
      return { slack: endpoint.config.url || endpoint.config.webhookUrl }
    
    case 'discord':
      return { discord: endpoint.config.url || endpoint.config.webhookUrl }
    
    default:
      return endpoint.config.url || "https://example.com/webhook"
  }
}

/**
 * Generate configuration file content
 */
function generateConfigContent(config: InboundConfig, format: 'typescript' | 'javascript' | 'json'): string {
  switch (format) {
    case 'typescript':
      return `import type { InboundConfig } from '@inboundemail/inbound-kit'

const config: InboundConfig = ${JSON.stringify(config, null, 2)}

export default config`
    
    case 'javascript':
      return `/** @type {import('@inboundemail/inbound-kit').InboundConfig} */
const config = ${JSON.stringify(config, null, 2)}

module.exports = config`
    
    case 'json':
      return JSON.stringify(config, null, 2)
  }
}
