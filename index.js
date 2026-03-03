require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { google } = require('googleapis');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Google Sheets Auth Setup
const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json', 
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Register the slash command to your server on startup
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), {
      body: [{
        name: 'verify',
        description: 'Verify your event token to get access',
        options: [{
          name: 'token',
          type: 3, // STRING type
          description: 'The 6-character token from your email',
          required: true,
        }],
      }],
    });
    console.log('Slash command registered.');
  } catch (error) {
    console.error('Failed to register slash command:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'verify') return;

  // Grab the token and acknowledge the interaction immediately so it doesn't time out
  const tokenInput = interaction.options.getString('token').trim().toUpperCase();
  await interaction.deferReply({ ephemeral: true });

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Fetch the rows. Adjust the range 'Form Responses 1!A:F' to match your layout
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Form Responses 1!A:F', 
    });

    const rows = response.data.values;
    let targetRowIndex = -1;

    // Search for the token. Assuming Token is Col E (index 4) and Status is Col F (index 5)
    for (let i = 1; i < rows.length; i++) { // Start at 1 to skip headers
      const row = rows[i];
      const sheetToken = row[4]; 
      const status = row[5]; 

      if (sheetToken === tokenInput) {
        if (status === 'Claimed') {
          return interaction.editReply('This token has already been claimed.');
        }
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return interaction.editReply('Invalid token. Please check your email and try again.');
    }

    // Token is valid and unused. Assign the role.
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(process.env.ROLE_ID);

    // Update the Google Sheet to mark it as claimed
    const rowNumber = targetRowIndex + 1; // Convert 0-indexed array to 1-indexed sheet row
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `Form Responses 1!F${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [['Claimed']] },
    });

    await interaction.editReply('Verification successful! You have been granted the event role.');

  } catch (error) {
    console.error('Verification error:', error);
    await interaction.editReply('An error occurred during verification. Please contact an admin.');
  }
});

client.login(process.env.DISCORD_TOKEN);
