# Setting up a Meta App for WhatsApp Business API

This guide walks you through creating a Meta App to send WhatsApp messages programmatically.

## Prerequisites
- A **Facebook Developer Account** ([developers.facebook.com](https://developers.facebook.com/)).
- A **Business Portfolio** (you can create one during the process).
- A phone number you can verify (or use a test number provided by Meta).

## Step 1: Create a Meta App
1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps).
2. Click **Create App**.
3. Select **Other** > **Next**.
4. Select app type: **Business** > **Next**.
5. Fill in the App Details:
   - **App Name**: e.g., "Soundwave Crackers Notifications"
   - **App Contact Email**: Your email.
   - **Business Portfolio**: Select your business portfolio (or leave as "No Business Portfolio" to create later, though linking to a business is recommended for production).
6. Click **Create app**.

## Step 2: Add WhatsApp Product
1. On the App Dashboard, scroll down to find **WhatsApp**.
2. Click **Set up**.
3. Select your Business Portfolio (if prompted) or create a new one.
4. Click **Continue**.

## Step 3: Get Temporary Credentials (for Testing)
1. On the left sidebar, go to **WhatsApp** > **API Setup**.
2. You will see:
   - **Temporary Access Token**: Good for 24 hours. Copy this.
   - **Phone Number ID**: Copy this (e.g., `100609346...`).
   - **WhatsApp Business Account ID**: Copy this.
3. **Send a Test Message**:
   - Scroll down to the "Send and receive messages" section.
   - In the "To" field, verify your own phone number.
   - **Important**: You must add numbers to the "Recipient Phone Numbers" list for test tokens to work.
   - Click **Send Message**.
   - Check your WhatsApp; you should receive a template message.

## Step 4: Configure a Permanent Access Token (System User) - DETAILED STEPS
To send messages automatically from your server without refreshing tokens every 24 hours, you need a System User token.

1.  **Go to Business Settings**:
    *   Navigate to [business.facebook.com/settings](https://business.facebook.com/settings).
    *   Make sure you have selected the correct Business Portfolio in the top-left dropdown.

2.  **Create a System User**:
    *   In the left sidebar, expand **Users** and click on **System Users**.
    *   Click the blue **Add** button.
    *   **System user name**: Enter `WhatsApp Bot` (or any name you prefer).
    *   **System user role**: Select **Admin**.
    *   Click **Create System User**.
    *   *Note: If you already have a System User, skip this step and click on their name.*

3.  **Assign Assets to the System User**:
    *   Select the System User you just created/selected.
    *   Click on **Add Assets** (or "Assign Assets").
    *   In the asset type menu, select **Apps**.
    *   Select your Meta App (`Soundwave Crackers Notifications`).
    *   In the right pane, toggle usually under "Full Control": **Manage App**.
    *   Click **Save Changes**.

4.  **Generate the Token**:
    *   With the System User still selected, click **Generate New Token**.
    *   **Select App**: Choose your app from the dropdown.
    *   **Token expiration**: Select **Never** (This is crucial for a permanent token).
    *   **Available permissions (Scopes)**: Scroll down and select the following permissions:
        *   `whatsapp_business_messaging`
        *   `whatsapp_business_management`
    *   Click **Generate Token**.

5.  **Save the Token**:
    *   A popup will show the token string (it starts with `EA...`).
    *   **COPY THIS TOKEN IMMEDIATELY** and store it securely (e.g., in a password manager or temporary text file). You will not be able to see it again once you close this window.

## Step 5: Add a Real Phone Number (Optional for now)
1. In the App Dashboard > WhatsApp > **API Setup**.
2. Scroll to "Step 5: Add a phone number".
3. Click **Add phone number**.
4. Follow the verification steps (SMS/Call).
5. Once verified, this number will have its own **Phone Number ID**. use that in your code.

## Next Steps
- Update your Supabase Edge Function secrets with:
  - `META_ACCESS_TOKEN` (The system user token)
  - `META_PHONE_NUMBER_ID`
  - `META_BUSINESS_ID` (Optional, mainly for management)
