# Setup Google OAuth Secrets for admin-studio

## Overview
The Google OAuth implementation for admin-studio requires two GitHub repository secrets. This guide explains what they are and how to configure them.

## Prerequisites
- Google OAuth 2.0 credentials (Client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials))
- List of email addresses authorized to access the production admin studio

## Required Secrets

### 1. `ADMIN_STUDIO_GOOGLE_CLIENT_ID`
**What it is:** Your Google OAuth 2.0 Client ID from Google Cloud Console

**How to get it:**
1. Go to https://console.cloud.google.com/apis/credentials
2. Select your project (or create one)
3. Click "Create Credentials" → "OAuth 2.0 Client ID"
4. Configure the OAuth consent screen if prompted
5. Choose "Web application" as the application type
6. Add your authorized redirect URIs:
   - `https://apunlimited.com/the` (production UI)
   - `http://localhost:5173` (local development)
7. Copy the "Client ID" value

**Where to set it:**
1. Go to https://github.com/Latimer-Woods-Tech/Factory/settings/secrets/actions
2. Click "New repository secret"
3. Name: `ADMIN_STUDIO_GOOGLE_CLIENT_ID`
4. Value: Paste your Client ID from step 7 above
5. Click "Add secret"

### 2. `ADMIN_STUDIO_ALLOWED_USERS_JSON`
**What it is:** A JSON map of email addresses allowed to log in, with their roles

**Format:**
```json
{
  "user1@example.com": { "role": "owner" },
  "user2@example.com": { "role": "owner" },
  "user3@example.com": { "role": "guest" }
}
```

**Valid roles:** `owner`, `editor`, `viewer`, `guest`

**Example for factory team:**
```json
{
  "adrper79@gmail.com": { "role": "owner" },
  "aperry@latwoodtech.com": { "role": "owner" },
  "blackkryptonians@gmail.com": { "role": "owner" }
}
```

**Where to set it:**
1. Go to https://github.com/Latimer-Woods-Tech/Factory/settings/secrets/actions
2. Click "New repository secret"
3. Name: `ADMIN_STUDIO_ALLOWED_USERS_JSON`
4. Value: Paste your JSON (as a single line or multiline—GitHub handles both)
5. Click "Add secret"

## Verification

### Before secrets are configured:
```bash
curl https://api.apunlimited.com/auth/google -X POST \
  -H "Content-Type: application/json" \
  -d '{"credential":"test","env":"production"}'

# Returns: {"error":"Google sign-in is not configured"}
```

### After secrets are configured:
1. Secrets are automatically used in the next GitHub Actions deploy
2. Test with a valid Google credential from frontend:
   - Visit https://apunlimited.com/the
   - Select "Production"
   - Click "Log in with Google"
   - You should be redirected to Google login
   - After successful Google login, you'll get a Factory JWT

## Deployment Flow

1. Secrets are configured in GitHub repository settings
2. Next push to main (or manual GitHub Actions trigger) picks up secrets
3. GitHub Actions workflow provisions secrets to Cloudflare Worker:
   - `ADMIN_STUDIO_GOOGLE_CLIENT_ID` → worker env `GOOGLE_CLIENT_ID`
   - `ADMIN_STUDIO_ALLOWED_USERS_JSON` → worker env `STUDIO_ALLOWED_USERS_JSON`
4. Worker is redeployed with new secrets (~3 minutes)
5. Google OAuth login is now fully functional

## Troubleshooting

**"Google sign-in is not configured"**
- Secrets haven't been created yet in GitHub
- Or workflow hasn't run after secrets were created
- Solution: Create the secrets, then trigger a new deploy (push to main or manual workflow_dispatch)

**"Access denied"**
- Your email is not in `ADMIN_STUDIO_ALLOWED_USERS_JSON`
- Check the allowlist JSON and add your email if needed

**"Invalid Google credential"**
- The token from Google couldn't be verified
- Make sure `ADMIN_STUDIO_GOOGLE_CLIENT_ID` matches the Client ID used by the frontend
- Check that the token hasn't expired

## Restore/Update Secrets

If you need to update the secrets:
1. Go to https://github.com/Latimer-Woods-Tech/Factory/settings/secrets/actions
2. Find the secret name
3. Click the pencil icon to edit
4. Update the value
5. Click "Update secret"
6. The next deploy will use the new value

## Security Notes

- These secrets are only accessible to GitHub Actions workflows
- They are shown in the Environment secrets panel but never logged in workflows
- Rotate `ADMIN_STUDIO_GOOGLE_CLIENT_ID` periodically by regenerating in Google Cloud Console
- Keep `ADMIN_STUDIO_ALLOWED_USERS_JSON` up-to-date as team changes
