/**
 * Status command - Show current state of Inbound resources
 */

import chalk from 'chalk'
import ora from 'ora'
import { loadAuth, createClient, validateAuth } from '../auth.js'
import { fetchCurrentState } from '../state.js'
import type { CLIOptions } from '../types.js'

export async function statusCommand(options: CLIOptions): Promise<void> {
  console.log(chalk.bold.blue('📊 Inbound Kit - Current Status\n'))

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

    // Display domains
    console.log(chalk.bold('🌐 Domains:'))
    const domainEntries = Object.entries(currentState.domains)
    
    if (domainEntries.length === 0) {
      console.log(chalk.gray('   No domains found'))
    } else {
      for (const [domain, domainState] of domainEntries) {
        const statusIcon = domainState.canReceiveEmails ? '✅' : '⚠️'
        const statusColor = domainState.canReceiveEmails ? chalk.green : chalk.yellow
        
        console.log(`   ${statusIcon} ${chalk.bold(domain)} ${statusColor(`(${domainState.status})`)}`)
        console.log(chalk.gray(`      ID: ${domainState.id}`))
        console.log(chalk.gray(`      Can receive emails: ${domainState.canReceiveEmails ? 'Yes' : 'No'}`))
        
        if (domainState.isCatchAllEnabled) {
          console.log(chalk.blue(`      Catch-all: Enabled (endpoint: ${domainState.catchAllEndpointId})`))
        } else {
          console.log(chalk.gray(`      Catch-all: Disabled`))
        }
        console.log('')
      }
    }

    // Display email addresses
    console.log(chalk.bold('📧 Email Addresses:'))
    const emailEntries = Object.entries(currentState.emailAddresses)
    
    if (emailEntries.length === 0) {
      console.log(chalk.gray('   No email addresses found'))
    } else {
      for (const [address, emailState] of emailEntries) {
        const statusIcon = emailState.isActive ? '✅' : '❌'
        const statusColor = emailState.isActive ? chalk.green : chalk.red
        
        console.log(`   ${statusIcon} ${chalk.bold(address)} ${statusColor(emailState.isActive ? '(active)' : '(inactive)')}`)
        console.log(chalk.gray(`      ID: ${emailState.id}`))
        console.log(chalk.gray(`      Domain ID: ${emailState.domainId}`))
        
        if (emailState.routing.type !== 'none' && emailState.routing.name) {
          const routingColor = emailState.routing.type === 'webhook' ? chalk.blue : 
                              emailState.routing.type === 'endpoint' ? chalk.cyan : chalk.gray
          console.log(routingColor(`      Routing: ${emailState.routing.type} → ${emailState.routing.name}`))
        } else {
          console.log(chalk.gray(`      Routing: None configured`))
        }
        console.log('')
      }
    }

    // Display endpoints
    console.log(chalk.bold('🔗 Endpoints:'))
    const endpointEntries = Object.entries(currentState.endpoints)
    
    if (endpointEntries.length === 0) {
      console.log(chalk.gray('   No endpoints found'))
    } else {
      for (const [endpointId, endpointState] of endpointEntries) {
        const statusIcon = endpointState.isActive ? '✅' : '❌'
        const statusColor = endpointState.isActive ? chalk.green : chalk.red
        const typeColor = endpointState.type === 'webhook' ? chalk.blue : 
                         endpointState.type === 'email' ? chalk.cyan : 
                         endpointState.type === 'email_group' ? chalk.magenta : chalk.gray
        
        console.log(`   ${statusIcon} ${chalk.bold(endpointState.name)} ${typeColor(`(${endpointState.type})`)} ${statusColor(endpointState.isActive ? '(active)' : '(inactive)')}`)
        console.log(chalk.gray(`      ID: ${endpointId}`))
        
        // Show endpoint-specific details
        switch (endpointState.type) {
          case 'webhook':
            console.log(chalk.gray(`      URL: ${endpointState.config.url}`))
            if (endpointState.config.timeout) {
              console.log(chalk.gray(`      Timeout: ${endpointState.config.timeout}s`))
            }
            if (endpointState.config.retryAttempts) {
              console.log(chalk.gray(`      Retry attempts: ${endpointState.config.retryAttempts}`))
            }
            break
          
          case 'email':
            console.log(chalk.gray(`      Forward to: ${endpointState.config.email}`))
            break
          
          case 'email_group':
            const emails = endpointState.config.emails || []
            console.log(chalk.gray(`      Forward to: ${emails.length} addresses`))
            if (options.verbose && emails.length > 0) {
              emails.forEach((email: string) => {
                console.log(chalk.gray(`        • ${email}`))
              })
            }
            break
        }
        console.log('')
      }
    }

    // Overall summary
    console.log(chalk.bold('📈 Summary:'))
    console.log(`   • ${domainEntries.length} domains`)
    console.log(`   • ${emailEntries.length} email addresses`)
    console.log(`   • ${endpointEntries.length} endpoints`)
    
    const activeDomains = domainEntries.filter(([, d]) => d.canReceiveEmails).length
    const activeEmails = emailEntries.filter(([, e]) => e.isActive).length
    const activeEndpoints = endpointEntries.filter(([, e]) => e.isActive).length
    
    console.log(chalk.green(`   • ${activeDomains} active domains`))
    console.log(chalk.green(`   • ${activeEmails} active email addresses`))
    console.log(chalk.green(`   • ${activeEndpoints} active endpoints`))

    // Show API info
    console.log(chalk.gray(`\n🔗 API Base URL: ${auth.baseUrl}`))

  } catch (error) {
    console.error(chalk.red('\n❌ Status check failed:'), error instanceof Error ? error.message : 'Unknown error')
    
    if (options.verbose) {
      console.error(chalk.gray('\nStack trace:'))
      console.error(error)
    }
    
    process.exit(1)
  }
}
