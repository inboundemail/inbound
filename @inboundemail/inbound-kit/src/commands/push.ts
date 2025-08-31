/**
 * Push command - Apply configuration to Inbound API
 */

import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { loadConfig } from '../config.js'
import { loadAuth, createClient, validateAuth } from '../auth.js'
import { fetchCurrentState, calculateDiff, applyChanges } from '../state.js'
import type { CLIOptions } from '../types.js'

/**
 * Extract domain from email address
 */
function extractDomainFromEmail(email: string): string {
  return email.split('@')[1]
}

export async function pushCommand(options: CLIOptions): Promise<void> {
  console.log(chalk.bold.blue('🚀 Inbound Kit - Push Configuration\n'))

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

    // Load configuration
    const { config, configPath, format } = await loadConfig(options.config)
    console.log(chalk.green(`✅ Loaded configuration from ${configPath} (${format})`))

    // Create SDK client
    const client = await createClient(auth)

    // Fetch current state
    const currentState = await fetchCurrentState(client)

    // Calculate differences
    console.log(chalk.blue('🔍 Calculating differences...'))
    const diff = calculateDiff(config, currentState)

    if (!diff.hasChanges) {
      console.log(chalk.green('✅ No changes needed - configuration is already in sync'))
      return
    }

    // Display changes
    console.log(chalk.yellow(`\n📋 Found ${diff.changes.length} changes:\n`))
    
    for (const change of diff.changes) {
      const icon = change.type === 'create' ? '➕' : change.type === 'update' ? '📝' : '🗑️'
      const color = change.type === 'create' ? chalk.green : change.type === 'update' ? chalk.yellow : chalk.red
      
      console.log(color(`${icon} ${change.type.toUpperCase()} ${change.resource}: ${change.key}`))
      if (change.reason) {
        console.log(chalk.gray(`   Reason: ${change.reason}`))
      }
    }

    // Confirm changes unless --force flag is used
    if (!options.force && !options.dryRun) {
      console.log('')
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Do you want to apply these changes?',
          default: false
        }
      ])

      if (!confirmed) {
        console.log(chalk.yellow('❌ Operation cancelled'))
        return
      }
    }

    // Apply changes (unless dry run)
    if (options.dryRun) {
      console.log(chalk.blue('\n🔍 Dry run mode - no changes will be applied'))
      return
    }

    await applyChanges(client, diff.changes, currentState)
    
    console.log(chalk.green('\n🎉 Configuration successfully pushed to Inbound!'))
    
    // Summary
    const createCount = diff.changes.filter(c => c.type === 'create').length
    const updateCount = diff.changes.filter(c => c.type === 'update').length  
    const deleteCount = diff.changes.filter(c => c.type === 'delete').length
    
    console.log(chalk.gray(`Summary: ${createCount} created, ${updateCount} updated, ${deleteCount} deleted`))

  } catch (error) {
    console.error(chalk.red('\n❌ Push failed:'), error instanceof Error ? error.message : 'Unknown error')
    
    if (options.verbose) {
      console.error(chalk.gray('\nStack trace:'))
      console.error(error)
    }
    
    process.exit(1)
  }
}
