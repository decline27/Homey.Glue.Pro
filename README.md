# GlueLock Pro for Homey

An enhanced version of the GlueLock app for Homey with improved status updates and firmware-specific features. This app provides better integration with Glue smart locks, including support for local operation detection on compatible firmware versions.

## Features

- **Firmware Detection**: Automatically detects lock firmware version and adjusts functionality accordingly
- **Enhanced Status Updates**: 
  - For firmware 2.5+: Properly detects local/manual lock operations
  - Configurable polling interval (1-60 minutes)
- **Event Types Supported**:
  - Remote Lock/Unlock
  - Manual Lock/Unlock
  - Local Lock/Unlock (firmware 2.5+)
- **Real-time Status**: Battery level and connection status monitoring
- **Improved Error Handling**: Better error reporting and logging

## Requirements

- Homey Pro
- Glue Smart Lock
- Glue account and API key

## Installation

1. Install the app on your Homey
2. Go to app settings
3. Enter your Glue API key
4. Add your Glue lock device

### Getting Your API Key

1. POST to https://user-api.gluehome.com/v1/api-keys
2. Use Basic-auth with your Glue account credentials:
   - Username: Your email
   - Password: Your account password
3. Request body:
```json
{
    "name": "HomeyKey",
    "scopes": [
        "events.read",
        "locks.read",
        "locks.write"
    ]
}
```

## Configuration

### Polling Interval
You can configure how often the app checks for lock status updates:
1. Go to device settings in the Homey app
2. Find "Status Update Interval"
3. Set your preferred interval (1-60 minutes, default: 20)

## Features by Firmware Version

### Firmware 2.5 and Later
- Full support for local operation detection
- Accurate status updates for all operation types
- Real-time status reflection for manual operations

### Earlier Firmware Versions
- Basic lock/unlock operation support
- Status updates based on remote operations
- Limited local operation detection

## Troubleshooting

If you experience issues:
1. Check if your API key is correctly configured
2. Verify your lock's firmware version in the Glue app
3. Ensure your lock is within Bluetooth range of your Homey
4. Check the app logs for detailed error messages

## Support

For issues and feature requests, please use the GitHub issues page.

## Credits

This is an enhanced version of the original GlueLock app by Kim Kokholm, with added features for better status handling and firmware compatibility.

## License

This project is licensed under the same terms as the original GlueLock app.

## Version History

- 1.0.0: Initial release of GlueLock Pro
  - Added firmware version detection
  - Implemented configurable polling
  - Enhanced status update handling
  - Improved error reporting