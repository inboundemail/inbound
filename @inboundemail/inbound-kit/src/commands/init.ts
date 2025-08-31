/**
 * Init command - Initialize a new Inbound Kit configuration
 */

import chalk from 'chalk'
import inquirer from 'inquirer'
import { writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { generateExampleConfig } from '../config.js'
import type { CLIOptions } from '../types.js'

export async function initCommand(options: CLIOptions): Promise<void> {
  console.log(chalk.bold.blue('🚀 Inbound Kit - Initialize Configuration\n'))

  try {
    // Check if config file already exists
    const configFiles = [
      'inbound.config.ts',
      'inbound.config.js',
      'inbound.config.mjs', 
      'inbound.config.json'
    ]

    const existingFile = configFiles.find(file => existsSync(resolve(process.cwd(), file)))
    
    if (existingFile && !options.force) {
      console.log(chalk.yellow(`⚠️  Configuration file already exists: ${existingFile}`))
      
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Do you want to overwrite it?',
          default: false
        }
      ])

      if (!overwrite) {
        console.log(chalk.yellow('❌ Initialization cancelled'))
        return
      }
    }

    // Ask for configuration options
    const answers = await inquirer.prompt([
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
      },
      {
        type: 'confirm',
        name: 'includeExamples',
        message: 'Include example configurations?',
        default: true
      },
      {
        type: 'input',
        name: 'primaryDomain',
        message: 'What is your primary domain? (optional)',
        validate: (input: string) => {
          if (!input.trim()) return true // Optional
          const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
          return domainRegex.test(input) || 'Please enter a valid domain name'
        }
      },
      {
        type: 'input',
        name: 'webhookUrl',
        message: 'Default webhook URL? (optional)',
        validate: (input: string) => {
          if (!input.trim()) return true // Optional
          try {
            new URL(input)
            return true
          } catch {
            return 'Please enter a valid URL'
          }
        }
      }
    ])

    // Generate configuration content
    let configContent: string

    if (answers.includeExamples) {
      // Generate example config
      configContent = generateExampleConfig(answers.format)
    } else {
      // Generate minimal config
      const minimalConfig = {
        emailAddresses: {}
      }

      // Add primary domain and webhook if provided
      if (answers.primaryDomain && answers.webhookUrl) {
        minimalConfig.emailAddresses = {
          [`hello@${answers.primaryDomain}`]: answers.webhookUrl
        }
      }

      switch (answers.format) {
        case 'typescript':
          configContent = `import type { InboundConfig } from '@inboundemail/inbound-kit'

const config: InboundConfig = ${JSON.stringify(minimalConfig, null, 2)}

export default config`
          break
        
        case 'javascript':
          configContent = `/** @type {import('@inboundemail/inbound-kit').InboundConfig} */
const config = ${JSON.stringify(minimalConfig, null, 2)}

module.exports = config`
          break
        
        case 'json':
          configContent = JSON.stringify(minimalConfig, null, 2)
          break
      }
    }

    // Determine output file
    const outputFile = answers.format === 'typescript' ? 'inbound.config.ts' : 
                      answers.format === 'javascript' ? 'inbound.config.js' : 
                      'inbound.config.json'

    // Write configuration file
    const outputPath = resolve(process.cwd(), outputFile)
    writeFileSync(outputPath, configContent, 'utf-8')

    console.log(chalk.green(`✅ Configuration file created: ${outputFile}`))

    // Show next steps
    console.log(chalk.blue('\n💡 Next steps:'))
    console.log(chalk.blue(`   1. Edit ${outputFile} to configure your email addresses and endpoints`))
    console.log(chalk.blue('   2. Ensure your .env file contains INBOUND_API_KEY'))
    console.log(chalk.blue('   3. Run `inbound-kit diff` to see what changes would be made'))
    console.log(chalk.blue('   4. Run `inbound-kit push` to apply your configuration'))

    // Show example .env content
    console.log(chalk.gray('\n📄 Example .env file:'))
    console.log(chalk.gray('INBOUND_API_KEY=your-api-key-here'))

    if (answers.includeExamples) {
      console.log(chalk.blue('\n📚 The generated configuration includes examples for:'))
      console.log(chalk.blue('   • Webhook endpoints'))
      console.log(chalk.blue('   • Email forwarding'))
      console.log(chalk.blue('   • Email groups'))
      console.log(chalk.blue('   • Slack integration'))
      console.log(chalk.blue('   • Domain catch-all settings'))
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Initialization failed:'), error instanceof Error ? error.message : 'Unknown error')
    
    if (options.verbose) {
      console.error(chalk.gray('\nStack trace:'))
      console.error(error)
    }
    
    process.exit(1)
  }
}
