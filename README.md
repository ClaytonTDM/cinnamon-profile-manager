# Cinnamon Profile Manager

A command-line tool for managing and switching between multiple Cinnamon desktop environment profiles. Easily save, restore, and share your Cinnamon desktop configurations.

## Features

- **Create profiles** from your current Cinnamon settings
- **Switch between profiles** to quickly change your entire desktop environment
- **Import/Export profiles** to share configurations between computers
- **Automatic backups** before making changes to your settings
- **Manual backups** for extra safety

## What Gets Backed Up?

Each profile preserves your complete Cinnamon desktop configuration, including:

- Panel layouts and settings
- Applets and their configurations
- Desktop themes and appearance settings
- Window manager settings
- Keyboard shortcuts and bindings
- Menu configurations
- Workspace settings
- Other Cinnamon-specific configurations

## Installation

### Prerequisites

The following tools are required:

- `zip` and `unzip` utilities
- `dconf` (usually installed with Cinnamon)
- [Deno](https://deno.land/) runtime (if not using pre-compiled binaries)

```bash
# Install prerequisites on Debian/Ubuntu-based systems
sudo apt install zip unzip dconf-cli

# Install Deno
curl -fsSL https://deno.land/install.sh | sh
```

### Install the Application

#### Method 1: Download pre-compiled binary

The easiest way to install Cinnamon Profile Manager is to download the pre-compiled binary from the [Releases](https://github.com/claytontdm/cinnamon-profile-manager/releases) tab on GitHub.

```bash
# Download latest binary
wget https://github.com/ClaytonTDM/cinnamon-profile-manager/releases/download/v0.1.0/cinnamon-profile-manager-x86_64

# Mark it as executable
chmod +x cinnamon-profile-manager-linux-x86_64

# Move it into a directory in your PATH (optional)
sudo mv cinnamon-profile-manager-linux-x86_64 /usr/local/bin/cinnamon-profile-manager
```

#### Method 2: Run directly with Deno

Clone the repository and run using Deno:

```bash
# Clone the repository
git clone https://github.com/claytontdm/cinnamon-profile-manager.git
cd cinnamon-profile-manager

# Run the application
deno task start
```

#### Method 3: Install from source

```bash
# Clone the repository
git clone https://github.com/claytontdm/cinnamon-profile-manager.git
cd cinnamon-profile-manager

# Compile the application
deno task compile

# Move the compiled binary to your PATH
sudo mv cinnamon-profile-manager /usr/local/bin/

# Make it executable
sudo chmod +x /usr/local/bin/cinnamon-profile-manager
```

#### Method 4: Cross-platform binaries

You can compile the binary using this command:

```bash
deno task compile
```

The compiled binary will be created in the project directory.

> **Note**: Pre-compiled binaries for Linux are available in the [Releases](https://github.com/claytontdm/cinnamon-profile-manager/releases) section of the GitHub repository. This is the recommended installation method for most users.

## Usage

### Basic Commands

```bash
# Show help
cinnamon-profile-manager --help

# List all available profiles
cinnamon-profile-manager list

# Create a new profile from your current setup
cinnamon-profile-manager create my-awesome-profile

# Switch to a different profile
cinnamon-profile-manager switch my-awesome-profile

# Update the active profile with your current settings
cinnamon-profile-manager update

# Delete a profile
cinnamon-profile-manager delete unwanted-profile
```

### Backup and Restore

```bash
# Create a manual backup of your current settings
cinnamon-profile-manager backup

# Restore settings from a backup
cinnamon-profile-manager restore
# (You'll be prompted to select from available backups)
```

### Import and Export Profiles

```bash
# Export a profile to share with others
cinnamon-profile-manager export my-awesome-theme
# (Saves to ~/Downloads or ~/ by default)

# Import a profile from a zip file
cinnamon-profile-manager import ~/Downloads/cinnamon-profile-my-awesome-theme-export-2025-05-16T12-00-00-000Z.zip
```

### Advanced Commands

```bash
# Reset all profiles and settings (BE CAREFUL!)
cinnamon-profile-manager reset
```

## Configuration

By default, profiles are stored in `~/.cinnamon-profiles/`. You can change this location by setting the `CINNAMON_PROFILES_DIR` environment variable:

```bash
export CINNAMON_PROFILES_DIR="/path/to/custom/directory"
```

## Development

This project is built using Deno and TypeScript:

```bash
# Run in development mode with automatic reloading
deno task dev

# Run normally
deno task start

# Compile binary
deno task compile
```

### Automated Builds

This project uses GitHub Actions for automated builds and releases:

- **CI Build**: Every push to the `main` branch triggers a build to ensure compilation works
- **Linting & Formatting**: Automatically ensures code style consistency
- **Releases**: When a new tag with format `v*` (e.g., `v0.1.0`) is pushed, GitHub Actions automatically:
  1. Builds binary for Linux
  2. Creates a new GitHub Release with this binary
  3. Generates release notes automatically

To create a new release:

```bash
# Tag the commit
git tag -a v0.1.0 -m "Release v0.1.0"

# Push the tag
git push origin v0.1.0
```

## License

[GPL-3.0 License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
