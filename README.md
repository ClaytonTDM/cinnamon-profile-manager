# Cinnamon Profile Manager

A command-line tool for managing and switching between multiple Cinnamon desktop environment profiles. Easily save, restore, and share your Cinnamon desktop configurations.

> [!WARNING]  
> This project is in **beta**. Expect bugs and incomplete features. Please report any issues you encounter!

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
- Fonts
- Other Cinnamon-specific configurations

## Installation

### Prerequisites

The following tools are required:

- `zip` and `unzip` utilities
- `dconf` (usually installed with Cinnamon)

```bash
# Install prerequisites on Debian/Ubuntu-based systems such as Linux Mint
sudo apt install zip unzip dconf-cli
```

### Install the Application

#### Method 1: Download pre-compiled binary

The easiest ways to install Cinnamon Profile Manager are to use the below command-line script, or by downloading the pre-compiled binary from the [Releases](https://github.com/claytontdm/cinnamon-profile-manager/releases) section on GitHub.

```bash
# Download latest binary
wget https://github.com/ClaytonTDM/cinnamon-profile-manager/releases/download/v0.2.1/cinnamon-profile-manager-x86_64

# Mark it as executable
chmod +x cinnamon-profile-manager-x86_64

# Move it into a directory in your PATH (optional)
sudo mv cinnamon-profile-manager-x86_64 /usr/local/bin/cinnamon-profile-manager
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

> **Note**: The pre-compiled binary is available in the [Releases](https://github.com/claytontdm/cinnamon-profile-manager/releases) section of the GitHub repository. This is the recommended installation method for most users.

## Usage

```
Usage: cinnamon-profile-manager [options] [command]

A tool for managing Cinnamon desktop environment profiles. Includes settings, spices, panels, etc.

Options:
  -V, --version            output the version number
  -h, --help               display help for command

Commands:
  list|ls                  List all available profiles.
  create [options] <name>  Create a new profile from current Cinnamon settings (files, dconf, themes, icons, and fonts).
  switch [options] <name>  Switch to a different profile (restores files, dconf, themes, icons, and fonts).
  delete|rm <name>         Delete an existing profile.
  backup [options]         Create a manual backup of current Cinnamon settings (files, dconf, themes, icons, and fonts).
  restore [options]        Restore Cinnamon settings from a manual backup (files, dconf, themes, icons, and fonts).
  list-backups|lb          List all available backup files (manual and automatic).
  export <name>            Export a profile to an external zip file (includes dconf settings, themes, icons, and fonts if present).
  import <filepath>        Import a profile from an external zip file (applies dconf, themes, icons, and fonts if present).
  update|up [options]      Update the currently active profile with current settings (including themes, icons, and fonts).
  reset                    DANGER: Delete all profiles, backups, and manager settings.
  help [command]           display help for command
```

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
