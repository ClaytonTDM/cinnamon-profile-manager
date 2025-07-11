/*
    Cinnamon Profile Manager - Manage and switch between Cinnamon desktop profiles
    Copyright (C) 2025  ClaytonTDM

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import chalk from "npm:chalk@^5.4.1";
import { Command } from "npm:commander@^13.1.0";
import { copy } from "jsr:@std/fs@^1.0.19/copy";
import { emptyDir } from "jsr:@std/fs@^1.0.17/empty-dir";
import { exists } from "jsr:@std/fs@^1.0.17/exists";
import { basename, join } from "jsr:@std/path@^1.1.1";
import { Table } from "jsr:@cliffy/table@^1.0.0-rc.8";

const VERSION = "0.1.1";
const PROGRAM_NAME = "cinnamon-profile-manager";

// --- configuration & constants ---
const ENV = {
	HOME: Deno.env.get("HOME"),
};

if (!ENV.HOME) {
	console.error(
		chalk.red(
			"Error: HOME environment variable not set. This tool cannot operate.",
		),
	);
	Deno.exit(1);
}

const APP_PATHS = {
	CUSTOM_PROFILES_ROOT_DIR: Deno.env.get("CINNAMON_PROFILES_DIR") ||
		join(ENV.HOME, ".cinnamon-profiles"),
	PROFILES_DB_FILE: "",
	BACKUP_DIR: "",
	AUTO_BACKUP_DIR: "",
};
APP_PATHS.PROFILES_DB_FILE = join(
	APP_PATHS.CUSTOM_PROFILES_ROOT_DIR,
	"profiles.json",
);
APP_PATHS.BACKUP_DIR = join(APP_PATHS.CUSTOM_PROFILES_ROOT_DIR, "backup");
APP_PATHS.AUTO_BACKUP_DIR = join(
	APP_PATHS.CUSTOM_PROFILES_ROOT_DIR,
	"auto-backup",
);

const CINNAMON_PATHS = {
	SHARE_DIR_RELATIVE: join(".local", "share", "cinnamon"),
	CONFIG_DIR_RELATIVE: join(".config", "cinnamon"),
	SHARE_DIR_ABSOLUTE: join(ENV.HOME, ".local", "share", "cinnamon"),
	CONFIG_DIR_ABSOLUTE: join(ENV.HOME, ".config", "cinnamon"),
};

const THEME_PATHS = {
	USER_THEMES_DIR: join(ENV.HOME, ".themes"),
	SYSTEM_THEMES_DIR: "/usr/share/themes",
};

const ICON_PATHS = {
	USER_ICONS_DIR: join(ENV.HOME, ".local", "share", "icons"),
	USER_ICONS_ALT_DIR: join(ENV.HOME, ".icons"),
	SYSTEM_ICONS_DIR: "/usr/share/icons",
};

const FONT_PATHS = {
	USER_FONTS_DIR: join(ENV.HOME, ".local", "share", "fonts"),
	USER_FONTS_ALT_DIR: join(ENV.HOME, ".fonts"),
	SYSTEM_FONTS_DIR: "/usr/share/fonts",
};

const DCONF_SETTINGS_FILE = "org.cinnamon.dconf.ini"; // file to store dconf settings

// --- type definitions ---
interface Profile {
	name: string;
	active: boolean;
	lastModified: string; // ISOString
	zipFile: string;
}

interface ComponentOptions {
	userThemes: boolean;
	systemThemes: boolean;
	userIcons: boolean;
	userIconsAlt: boolean;
	systemIcons: boolean;
	userFonts: boolean;
	userFontsAlt: boolean;
	systemFonts: boolean;
	dconf: boolean;
}

interface CommandOptions {
	userThemes?: boolean;
	addSystemThemes?: boolean;
	userIconsLocal?: boolean;
	userIconsHome?: boolean;
	addSystemIcons?: boolean;
	userFontsLocal?: boolean;
	userFontsHome?: boolean;
	addSystemFonts?: boolean;
	dconf?: boolean;
	noBackup?: boolean;
}

interface CommandResult {
	success: boolean;
	stdout: string;
	stderr: string;
	code: number;
}

interface CommanderError extends Error {
	code?: string;
}

// --- helper functions ---

/**
 * Executes an external command and returns its output.
 * Supports piping content to stdin if `stdinContent` is provided.
 */
async function executeCommand(
	command: string,
	args: string[],
	options?:
		& Omit<
			Deno.CommandOptions,
			"args" | "stdout" | "stderr" | "stdin"
		>
		& { stdinContent?: string },
): Promise<CommandResult> {
	try {
		const { stdinContent, ...denoOptions } = options || {};
		const cmd = new Deno.Command(command, {
			...denoOptions,
			args,
			stdout: "piped",
			stderr: "piped",
			stdin: stdinContent !== undefined ? "piped" : "null",
		});

		const process = cmd.spawn();

		if (stdinContent !== undefined && process.stdin) {
			const writer = process.stdin.getWriter();
			await writer.write(new TextEncoder().encode(stdinContent));
			await writer.close();
		}

		const output = await process.output(); // this waits for the process to exit and collects all output

		return {
			success: output.code === 0,
			stdout: new TextDecoder().decode(output.stdout),
			stderr: new TextDecoder().decode(output.stderr),
			code: output.code,
		};
	} catch (error) {
		return {
			success: false,
			stdout: "",
			stderr: error instanceof Error
				? error.message
				: "Failed to execute command (Deno.Command error).",
			code: -1,
		};
	}
}

/**
 * Gets the path of a command using "which".
 */
async function getCommandPath(commandName: string): Promise<string | null> {
	const result = await executeCommand("which", [commandName]);
	if (result.success && result.stdout.trim()) {
		return result.stdout.trim();
	}
	return null;
}

/**
 * Ensures application directories and profile file exist.
 */
async function ensureAppDirectories(): Promise<void> {
	if (!(await exists(APP_PATHS.CUSTOM_PROFILES_ROOT_DIR))) {
		console.log(
			chalk.blue(
				`Creating custom profiles directory: ${APP_PATHS.CUSTOM_PROFILES_ROOT_DIR}`,
			),
		);
		await Deno.mkdir(APP_PATHS.CUSTOM_PROFILES_ROOT_DIR, {
			recursive: true,
		});
	}
	if (!(await exists(APP_PATHS.PROFILES_DB_FILE))) {
		console.log(
			chalk.blue(`Creating profiles file: ${APP_PATHS.PROFILES_DB_FILE}`),
		);
		await Deno.writeTextFile(
			APP_PATHS.PROFILES_DB_FILE,
			JSON.stringify([], null, 2),
		);
	}
	for (const dir of [APP_PATHS.BACKUP_DIR, APP_PATHS.AUTO_BACKUP_DIR]) {
		if (!(await exists(dir))) {
			await Deno.mkdir(dir, { recursive: true });
		}
	}
}

/**
 * Reads profiles from the JSON database file.
 */
async function readProfiles(): Promise<Profile[]> {
	if (!(await exists(APP_PATHS.PROFILES_DB_FILE))) {
		return [];
	}
	const content = await Deno.readTextFile(APP_PATHS.PROFILES_DB_FILE);
	try {
		const profiles = JSON.parse(content);
		if (!Array.isArray(profiles)) {
			throw new Error("Profiles data is not an array.");
		}
		return profiles as Profile[];
	} catch (e) {
		console.error(
			chalk.red(
				`Error parsing profiles.json: ${
					e instanceof Error ? e.message : "Unknown error"
				}.`,
			),
		);
		console.warn(
			chalk.yellow(
				`Backing up corrupted profiles.json and creating a new empty one.`,
			),
		);
		try {
			await Deno.copyFile(
				APP_PATHS.PROFILES_DB_FILE,
				`${APP_PATHS.PROFILES_DB_FILE}.corrupted-${Date.now()}`,
			);
		} catch (backupError) {
			console.error(
				chalk.red(
					`Failed to backup corrupted profiles.json: ${
						backupError instanceof Error
							? backupError.message
							: "Unknown error"
					}`,
				),
			);
		}
		await Deno.writeTextFile(
			APP_PATHS.PROFILES_DB_FILE,
			JSON.stringify([], null, 2),
		);
		return [];
	}
}

/**
 * Writes profiles to the JSON database file.
 */
async function writeProfiles(profiles: Profile[]): Promise<void> {
	await Deno.writeTextFile(
		APP_PATHS.PROFILES_DB_FILE,
		JSON.stringify(profiles, null, 2),
	);
}

/**
 * Executes an action within a temporary directory, ensuring cleanup.
 */
async function withTempDir<T>(
	options: Deno.MakeTempOptions,
	action: (tempDir: string) => Promise<T>,
): Promise<T> {
	const tempDir = await Deno.makeTempDir(options);
	try {
		return await action(tempDir);
	} finally {
		await Deno.remove(tempDir, { recursive: true });
	}
}

/**
 * Copies the contents of a source directory to a destination directory.
 */
async function copyDirectoryContents(
	sourceDir: string,
	destinationDir: string,
): Promise<void> {
	if (!(await exists(sourceDir))) {
		console.warn(
			chalk.yellow(
				`Warning: Source directory ${sourceDir} does not exist. Skipping copy of its contents.`,
			),
		);
		return;
	}
	await Deno.mkdir(destinationDir, { recursive: true });
	for await (const entry of Deno.readDir(sourceDir)) {
		const sourcePath = join(sourceDir, entry.name);
		const destinationPath = join(destinationDir, entry.name);
		try {
			await copy(sourcePath, destinationPath, {
				overwrite: true,
			});
		} catch (error) {
			console.warn(
				chalk.yellow(
					`Warning: Failed to copy ${sourcePath} to ${destinationPath}: ${
						error instanceof Error ? error.message : "Unknown error"
					}. Skipping this file/directory.`,
				),
			);
		}
	}
}

/**
 * Zips all contents of a directory.
 */
async function zipDirectoryContents(
	sourceDir: string,
	zipFilePath: string,
): Promise<boolean> {
	// arguments for zip: -r (recursive), -q (quiet), zipFilePath (target archive), "." (current dir contents)
	const args = ["-rq", zipFilePath, "."];

	let isEmpty = true;
	try {
		for await (const _entry of Deno.readDir(sourceDir)) {
			isEmpty = false;
			break;
		}
	} catch (e) {
		// if sourceDir doesn't exist, Deno.readDir will throw.
		console.error(
			chalk.red(
				`Error reading source directory ${sourceDir} for zipping: ${
					e instanceof Error ? e.message : String(e)
				}`,
			),
		);
		return false;
	}

	if (isEmpty) {
		console.warn(
			chalk.yellow(
				`Warning: Source directory ${sourceDir} for zipping is empty. Archive will be empty.`,
			),
		);
		// allow creating an empty zip, but it might indicate an upstream issue.
	}

	const zipResult = await executeCommand("zip", args, { cwd: sourceDir });

	if (!zipResult.success) {
		console.error(
			chalk.red(`Error: Failed to create archive at ${zipFilePath}.`),
		);
		console.error(chalk.gray(`zip stderr: ${zipResult.stderr}`));
		return false;
	}
	return true;
}

/**
 * Unzips an archive to a specified directory.
 */
async function unzipArchive(
	zipFilePath: string,
	destinationDir: string,
): Promise<boolean> {
	const unzipResult = await executeCommand("unzip", [
		"-oq",
		zipFilePath,
		"-d",
		destinationDir,
	]);
	if (!unzipResult.success) {
		console.error(
			chalk.red(`Error: Failed to extract archive ${zipFilePath}.`),
		);
		console.error(chalk.gray(`unzip stderr: ${unzipResult.stderr}`));
		return false;
	}
	return true;
}

/**
 * Print a styled header for the application
 */
function printHeader(): void {
	console.log(chalk.cyan("Cinnamon Profile Manager") + " v" + VERSION);
	console.log(
		chalk.gray("Manage and switch between Cinnamon desktop profiles"),
	);
	console.log("");
}

/**
 * List available profiles
 */
async function listProfiles(): Promise<void> {
	console.log(chalk.yellow("Available Profiles:"));
	const profiles = await readProfiles();

	if (profiles.length === 0) {
		console.log(
			chalk.gray(
				"No profiles created yet. Use 'create <name>' to make one.",
			),
		);
		return;
	}

	const table = new Table()
		.header(["Name", "Status", "Last Modified"])
		.padding(2)
		.border(true);
	for (const profile of profiles) {
		table.push([
			profile.name,
			profile.active ? chalk.green("Active") : "Inactive",
			new Date(profile.lastModified).toLocaleString(),
		]);
	}
	console.log(table.toString());
	console.log(
		chalk.gray(`Use ${PROGRAM_NAME} switch <name> to switch profiles`),
	);
}

/**
 * List all available backup files
 */
async function listBackups(): Promise<void> {
	console.log(chalk.yellow("Available Backup Files:"));
	
	if (
		!(await exists(APP_PATHS.BACKUP_DIR)) &&
		!(await exists(APP_PATHS.AUTO_BACKUP_DIR))
	) {
		console.log(
			chalk.gray("No backup directories found. No backups available."),
		);
		return;
	}

	const filesWithDates: {
		filename: string;
		date: Date | null;
		fullPath: string;
		type: string;
	}[] = [];

	// process manual backups
	if (await exists(APP_PATHS.BACKUP_DIR)) {
		for await (const dirEntry of Deno.readDir(APP_PATHS.BACKUP_DIR)) {
			if (dirEntry.isFile && dirEntry.name.endsWith(".zip")) {
				let date: Date | null = null;
				const dateMatch = dirEntry.name.match(
					/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.zip$/,
				);
				if (dateMatch) {
					const datePart = dateMatch[1];
					const isoStr = datePart.substring(0, 13) +
						":" +
						datePart.substring(14, 16) +
						":" +
						datePart.substring(17, 19) +
						"." +
						datePart.substring(20, 23) +
						"Z";
					try {
						date = new Date(isoStr);
						if (isNaN(date.getTime())) {
							date = null;
						}
					} catch (_e) {
						date = null;
					}
				}
				filesWithDates.push({
					filename: dirEntry.name,
					date,
					fullPath: join(APP_PATHS.BACKUP_DIR, dirEntry.name),
					type: "Manual",
				});
			}
		}
	}

	// process auto backups
	if (await exists(APP_PATHS.AUTO_BACKUP_DIR)) {
		for await (const dirEntry of Deno.readDir(APP_PATHS.AUTO_BACKUP_DIR)) {
			if (dirEntry.isFile && dirEntry.name.endsWith(".zip")) {
				let date: Date | null = null;
				const dateMatch = dirEntry.name.match(
					/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.zip$/,
				);
				if (dateMatch) {
					const datePart = dateMatch[1];
					const isoStr = datePart.substring(0, 13) +
						":" +
						datePart.substring(14, 16) +
						":" +
						datePart.substring(17, 19) +
						"." +
						datePart.substring(20, 23) +
						"Z";
					try {
						date = new Date(isoStr);
						if (isNaN(date.getTime())) {
							date = null;
						}
					} catch (_e) {
						date = null;
					}
				}
				filesWithDates.push({
					filename: dirEntry.name,
					date,
					fullPath: join(APP_PATHS.AUTO_BACKUP_DIR, dirEntry.name),
					type: "Auto",
				});
			}
		}
	}

	if (filesWithDates.length === 0) {
		console.log(
			chalk.gray("No backup files found in the backup directories."),
		);
		return;
	}

	filesWithDates.sort((a, b) => {
		if (!a.date && !b.date) return a.filename.localeCompare(b.filename);
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.getTime() - a.date.getTime(); // newest first
	});

	const table = new Table()
		.header(["Backup File", "Date", "Type", "Path"])
		.padding(2)
		.border(true);
	
	for (const { filename, date, type, fullPath } of filesWithDates) {
		table.push([
			filename,
			date ? date.toLocaleString() : "Unknown",
			type,
			fullPath,
		]);
	}
	
	console.log(table.toString());
	console.log(
		chalk.gray(`Use ${PROGRAM_NAME} restore to restore from a backup`),
	);
}

/**
 * Create a new profile based on the current settings
 */
async function createProfile(name: string, options: CommandOptions): Promise<void> {
	console.log(chalk.yellow(`Creating new profile: ${name}`));
	let profiles = await readProfiles();
	if (profiles.some((p) => p.name === name)) {
		console.error(
			chalk.red(`Error: Profile with name "${name}" already exists.`),
		);
		Deno.exit(1);
	}

	const componentOptions: ComponentOptions = {
		userThemes: options.userThemes !== false,
		systemThemes: options.addSystemThemes === true,
		userIcons: options.userIconsLocal !== false,
		userIconsAlt: options.userIconsHome !== false,
		systemIcons: options.addSystemIcons === true,
		userFonts: options.userFontsLocal !== false,
		userFontsAlt: options.userFontsHome !== false,
		systemFonts: options.addSystemFonts === true,
		dconf: options.dconf !== false,
	};

	const success = await withTempDir(
		{ prefix: "cinnamon-profile-" },
		async (tempDir) => {
			const tempShareDir = join(tempDir, "share");
			const tempConfigDir = join(tempDir, "config");

			console.log(
				chalk.gray("Copying current Cinnamon file-based settings..."),
			);
			await copyDirectoryContents(
				CINNAMON_PATHS.SHARE_DIR_ABSOLUTE,
				tempShareDir,
			);
			await copyDirectoryContents(
				CINNAMON_PATHS.CONFIG_DIR_ABSOLUTE,
				tempConfigDir,
			);

			// copy themes, icons, and fonts
			await copyThemeIconAndFontDirectories(tempDir, componentOptions);

			// dump dconf settings
			if (componentOptions.dconf) {
				const dconfDumpPath = join(tempDir, DCONF_SETTINGS_FILE);
				console.log(
					chalk.gray(
						`Dumping dconf settings for /org/cinnamon/ to ${
							basename(
								dconfDumpPath,
							)
						}...`,
					),
				);
				const dconfDumpResult = await executeCommand("dconf", [
					"dump",
					"/org/cinnamon/",
				]);
				if (dconfDumpResult.success && dconfDumpResult.stdout) {
					await Deno.writeTextFile(dconfDumpPath, dconfDumpResult.stdout);
					console.log(chalk.gray("dconf settings dumped successfully."));
				} else {
					console.warn(
						chalk.yellow(
							`Warning: Failed to dump dconf settings for /org/cinnamon/. Profile will be created without them.`,
						),
					);
					console.warn(
						chalk.gray(`dconf stderr: ${dconfDumpResult.stderr}`),
					);
				}
			} else {
				console.log(chalk.gray("Skipping dconf settings (disabled by option)."));
			}

			const zipFile = join(
				APP_PATHS.CUSTOM_PROFILES_ROOT_DIR,
				`${name}-${crypto.randomUUID()}.zip`,
			);
			console.log(chalk.gray(`Zipping profile to ${zipFile}...`));
			if (!(await zipDirectoryContents(tempDir, zipFile))) {
				return false;
			}

			profiles = await readProfiles();
			profiles.forEach((p) => (p.active = false));
			profiles.push({
				name: name,
				active: true,
				lastModified: new Date().toISOString(),
				zipFile: zipFile,
			});
			await writeProfiles(profiles);
			return true;
		},
	);

	if (success) {
		console.log(chalk.green("Profile created and activated successfully"));
	} else {
		console.error(chalk.red("Profile creation failed."));
		Deno.exit(1);
	}
}

/**
 * Creates a backup of current Cinnamon settings with a timestamp.
 * @param targetDir - The directory to save the backup to.
 * @param prefix - Prefix for the backup filename.
 * @returns Path to the created backup file, or null on failure.
 */
async function createTimestampedBackup(
	targetDir: string,
	prefix: string = "backup",
	options?: ComponentOptions,
): Promise<string | null> {
	const componentOptions: ComponentOptions = options || {
		userThemes: true,
		systemThemes: true,
		userIcons: true,
		userIconsAlt: true,
		systemIcons: true,
		userFonts: true,
		userFontsAlt: true,
		systemFonts: true,
		dconf: true,
	};

	if (!(await exists(targetDir))) {
		await Deno.mkdir(targetDir, { recursive: true });
	}
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupFile = join(targetDir, `${prefix}-${timestamp}.zip`);

	const success = await withTempDir(
		{ prefix: "cinnamon-backup-" },
		async (tempDir) => {
			const tempShareDir = join(tempDir, "share");
			const tempConfigDir = join(tempDir, "config");

			console.log(
				chalk.gray(
					"Copying current Cinnamon file-based settings for backup...",
				),
			);
			await copyDirectoryContents(
				CINNAMON_PATHS.SHARE_DIR_ABSOLUTE,
				tempShareDir,
			);
			await copyDirectoryContents(
				CINNAMON_PATHS.CONFIG_DIR_ABSOLUTE,
				tempConfigDir,
			);

			// copy themes, icons, and fonts for backup
			await copyThemeIconAndFontDirectories(tempDir, componentOptions);

			// dump dconf settings for backup
			if (componentOptions.dconf) {
				const dconfDumpPath = join(tempDir, DCONF_SETTINGS_FILE);
				console.log(
					chalk.gray(
						`Dumping dconf settings for /org/cinnamon/ to ${
							basename(
								dconfDumpPath,
							)
						} for backup...`,
					),
				);
				const dconfDumpResult = await executeCommand("dconf", [
					"dump",
					"/org/cinnamon/",
				]);
				if (dconfDumpResult.success && dconfDumpResult.stdout) {
					await Deno.writeTextFile(dconfDumpPath, dconfDumpResult.stdout);
					console.log(
						chalk.gray(
							"dconf settings dumped successfully for backup.",
						),
					);
				} else {
					console.warn(
						chalk.yellow(
							`Warning: Failed to dump dconf settings for /org/cinnamon/ during backup. Backup will not include them.`,
						),
					);
					console.warn(
						chalk.gray(`dconf stderr: ${dconfDumpResult.stderr}`),
					);
				}
			} else {
				console.log(chalk.gray("Skipping dconf settings backup (disabled by option)."));
			}

			console.log(chalk.gray(`Zipping backup to ${backupFile}...`));
			return await zipDirectoryContents(tempDir, backupFile);
		},
	);

	return success ? backupFile : null;
}

/**
 * Copies theme directories from both user and system locations
 */
async function copyThemeDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	if (options.userThemes) {
		const tempUserThemesDir = join(tempDir, "user-themes");
		console.log(chalk.gray("Copying user themes from ~/.themes..."));
		if (await exists(THEME_PATHS.USER_THEMES_DIR)) {
			await copyDirectoryContents(THEME_PATHS.USER_THEMES_DIR, tempUserThemesDir);
		} else {
			console.log(chalk.gray("No user themes directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user themes (disabled by option)."));
	}

	if (options.systemThemes) {
		const tempSystemThemesDir = join(tempDir, "system-themes");
		console.log(chalk.gray("Copying system themes from /usr/share/themes..."));
		if (await exists(THEME_PATHS.SYSTEM_THEMES_DIR)) {
			try {
				await copyDirectoryContents(THEME_PATHS.SYSTEM_THEMES_DIR, tempSystemThemesDir);
			} catch (error) {
				console.warn(
					chalk.yellow(
						`Warning: Could not copy system themes (permission issue?): ${
							error instanceof Error ? error.message : "Unknown error"
						}`
					)
				);
			}
		} else {
			console.log(chalk.gray("No system themes directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping system themes (not enabled)."));
	}
}

/**
 * Copies icon directories from user and system locations
 */
async function copyIconDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	if (options.userIcons) {
		const tempUserIconsDir = join(tempDir, "user-icons");
		console.log(chalk.gray("Copying user icons from ~/.local/share/icons..."));
		if (await exists(ICON_PATHS.USER_ICONS_DIR)) {
			await copyDirectoryContents(ICON_PATHS.USER_ICONS_DIR, tempUserIconsDir);
		} else {
			console.log(chalk.gray("No user icons directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user icons from ~/.local/share/icons (disabled by option)."));
	}

	if (options.userIconsAlt) {
		const tempUserIconsAltDir = join(tempDir, "user-icons-alt");
		console.log(chalk.gray("Copying user icons from ~/.icons..."));
		if (await exists(ICON_PATHS.USER_ICONS_ALT_DIR)) {
			await copyDirectoryContents(ICON_PATHS.USER_ICONS_ALT_DIR, tempUserIconsAltDir);
		} else {
			console.log(chalk.gray("No ~/.icons directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user icons from ~/.icons (disabled by option)."));
	}

	if (options.systemIcons) {
		const tempSystemIconsDir = join(tempDir, "system-icons");
		console.log(chalk.gray("Copying system icons from /usr/share/icons..."));
		if (await exists(ICON_PATHS.SYSTEM_ICONS_DIR)) {
			try {
				await copyDirectoryContents(ICON_PATHS.SYSTEM_ICONS_DIR, tempSystemIconsDir);
			} catch (error) {
				console.warn(
					chalk.yellow(
						`Warning: Could not copy system icons (permission issue?): ${
							error instanceof Error ? error.message : "Unknown error"
						}`
					)
				);
			}
		} else {
			console.log(chalk.gray("No system icons directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping system icons (not enabled)."));
	}
}

/**
 * Copies font directories from user and system locations
 */
async function copyFontDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	if (options.userFonts) {
		const tempUserFontsDir = join(tempDir, "user-fonts");
		console.log(chalk.gray("Copying user fonts from ~/.local/share/fonts..."));
		if (await exists(FONT_PATHS.USER_FONTS_DIR)) {
			await copyDirectoryContents(FONT_PATHS.USER_FONTS_DIR, tempUserFontsDir);
		} else {
			console.log(chalk.gray("No user fonts directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user fonts from ~/.local/share/fonts (disabled by option)."));
	}

	if (options.userFontsAlt) {
		const tempUserFontsAltDir = join(tempDir, "user-fonts-home");
		console.log(chalk.gray("Copying user fonts from ~/.fonts..."));
		if (await exists(FONT_PATHS.USER_FONTS_ALT_DIR)) {
			await copyDirectoryContents(FONT_PATHS.USER_FONTS_ALT_DIR, tempUserFontsAltDir);
		} else {
			console.log(chalk.gray("No ~/.fonts directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user fonts from ~/.fonts (disabled by option)."));
	}

	if (options.systemFonts) {
		const tempSystemFontsDir = join(tempDir, "system-fonts");
		console.log(chalk.gray("Copying system fonts from /usr/share/fonts..."));
		if (await exists(FONT_PATHS.SYSTEM_FONTS_DIR)) {
			try {
				await copyDirectoryContents(FONT_PATHS.SYSTEM_FONTS_DIR, tempSystemFontsDir);
			} catch (error) {
				console.warn(
					chalk.yellow(
						`Warning: Could not copy system fonts (permission issue?): ${
							error instanceof Error ? error.message : "Unknown error"
						}`
					)
				);
			}
		} else {
			console.log(chalk.gray("No system fonts directory found, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping system fonts (not enabled)."));
	}
}

/**
 * Copies theme, icon, and font directories from both user and system locations
 */
async function copyThemeIconAndFontDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	await copyThemeDirectories(tempDir, options);
	await copyIconDirectories(tempDir, options);
	await copyFontDirectories(tempDir, options);
}

/**
 * Restores theme directories to both user and system locations
 */
async function restoreThemeDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	if (options.userThemes) {
		const tempUserThemesDir = join(tempDir, "user-themes");
		console.log(chalk.gray("Restoring user themes to ~/.themes..."));
		if (await exists(tempUserThemesDir)) {
			// ensure user themes directory exists
			await Deno.mkdir(THEME_PATHS.USER_THEMES_DIR, { recursive: true });
			await copyDirectoryContents(tempUserThemesDir, THEME_PATHS.USER_THEMES_DIR);
		} else {
			console.log(chalk.gray("No user themes found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user themes restoration (disabled by option)."));
	}

	if (options.systemThemes) {
		const tempSystemThemesDir = join(tempDir, "system-themes");
		console.log(chalk.gray("Restoring system themes to /usr/share/themes..."));
		if (await exists(tempSystemThemesDir)) {
			try {
				await copyDirectoryContents(tempSystemThemesDir, THEME_PATHS.SYSTEM_THEMES_DIR);
			} catch (error) {
				console.warn(
					chalk.yellow(
						`Warning: Could not restore system themes (permission issue?): ${
							error instanceof Error ? error.message : "Unknown error"
						}. You may need to manually copy themes with elevated privileges.`
					)
				);
			}
		} else {
			console.log(chalk.gray("No system themes found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping system themes restoration (not enabled)."));
	}
}

/**
 * Restores icon directories to user and system locations
 */
async function restoreIconDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	if (options.userIcons) {
		const tempUserIconsDir = join(tempDir, "user-icons");
		console.log(chalk.gray("Restoring user icons to ~/.local/share/icons..."));
		if (await exists(tempUserIconsDir)) {
			// ensure user icons directory exists
			await Deno.mkdir(ICON_PATHS.USER_ICONS_DIR, { recursive: true });
			await copyDirectoryContents(tempUserIconsDir, ICON_PATHS.USER_ICONS_DIR);
		} else {
			console.log(chalk.gray("No user icons found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user icons restoration to ~/.local/share/icons (disabled by option)."));
	}

	if (options.userIconsAlt) {
		const tempUserIconsAltDir = join(tempDir, "user-icons-alt");
		console.log(chalk.gray("Restoring user icons to ~/.icons..."));
		if (await exists(tempUserIconsAltDir)) {
			// ensure user icons alt directory exists
			await Deno.mkdir(ICON_PATHS.USER_ICONS_ALT_DIR, { recursive: true });
			await copyDirectoryContents(tempUserIconsAltDir, ICON_PATHS.USER_ICONS_ALT_DIR);
		} else {
			console.log(chalk.gray("No ~/.icons found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user icons restoration to ~/.icons (disabled by option)."));
	}

	if (options.systemIcons) {
		const tempSystemIconsDir = join(tempDir, "system-icons");
		console.log(chalk.gray("Restoring system icons to /usr/share/icons..."));
		if (await exists(tempSystemIconsDir)) {
			try {
				await copyDirectoryContents(tempSystemIconsDir, ICON_PATHS.SYSTEM_ICONS_DIR);
			} catch (error) {
				console.warn(
					chalk.yellow(
						`Warning: Could not restore system icons (permission issue?): ${
							error instanceof Error ? error.message : "Unknown error"
						}. You may need to manually copy icons with elevated privileges.`
					)
				);
			}
		} else {
			console.log(chalk.gray("No system icons found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping system icons restoration (not enabled)."));
	}
}

/**
 * Restores font directories to user and system locations
 */
async function restoreFontDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	if (options.userFonts) {
		const tempUserFontsDir = join(tempDir, "user-fonts");
		console.log(chalk.gray("Restoring user fonts to ~/.local/share/fonts..."));
		if (await exists(tempUserFontsDir)) {
			// ensure user fonts directory exists
			await Deno.mkdir(FONT_PATHS.USER_FONTS_DIR, { recursive: true });
			await copyDirectoryContents(tempUserFontsDir, FONT_PATHS.USER_FONTS_DIR);
		} else {
			console.log(chalk.gray("No user fonts found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user fonts restoration to ~/.local/share/fonts (disabled by option)."));
	}

	if (options.userFontsAlt) {
		const tempUserFontsAltDir = join(tempDir, "user-fonts-home");
		console.log(chalk.gray("Restoring user fonts to ~/.fonts..."));
		if (await exists(tempUserFontsAltDir)) {
			// ensure user fonts alt directory exists
			await Deno.mkdir(FONT_PATHS.USER_FONTS_ALT_DIR, { recursive: true });
			await copyDirectoryContents(tempUserFontsAltDir, FONT_PATHS.USER_FONTS_ALT_DIR);
		} else {
			console.log(chalk.gray("No ~/.fonts found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping user fonts restoration to ~/.fonts (disabled by option)."));
	}

	if (options.systemFonts) {
		const tempSystemFontsDir = join(tempDir, "system-fonts");
		console.log(chalk.gray("Restoring system fonts to /usr/share/fonts..."));
		if (await exists(tempSystemFontsDir)) {
			try {
				await copyDirectoryContents(tempSystemFontsDir, FONT_PATHS.SYSTEM_FONTS_DIR);
			} catch (error) {
				console.warn(
					chalk.yellow(
						`Warning: Could not restore system fonts (permission issue?): ${
							error instanceof Error ? error.message : "Unknown error"
						}`
					)
				);
			}
		} else {
			console.log(chalk.gray("No system fonts found in backup, skipping."));
		}
	} else {
		console.log(chalk.gray("Skipping system fonts restoration (not enabled)."));
	}
}

/**
 * Restores theme, icon, and font directories to both user and system locations
 */
async function restoreThemeIconAndFontDirectories(tempDir: string, options: ComponentOptions): Promise<void> {
	await restoreThemeDirectories(tempDir, options);
	await restoreIconDirectories(tempDir, options);
	await restoreFontDirectories(tempDir, options);
}

// ...existing code...

/**
 * Restores Cinnamon settings from a given profile or backup zip file.
 */
async function restoreSettingsFromZip(
	zipFilePath: string,
	isProfileSwitch: boolean = false,
	options?: ComponentOptions,
	skipBackup: boolean = false,
): Promise<boolean> {
	const componentOptions: ComponentOptions = options || {
		userThemes: true,
		systemThemes: true,
		userIcons: true,
		userIconsAlt: true,
		systemIcons: true,
		userFonts: true,
		userFontsAlt: true,
		systemFonts: true,
		dconf: true,
	};

	if (!(await exists(zipFilePath))) {
		console.error(
			chalk.red(`Error: Archive file not found: ${zipFilePath}`),
		);
		return false;
	}

	return await withTempDir(
		{ prefix: "cinnamon-restore-" },
		async (tempDir) => {
			console.log(
				chalk.gray(
					`Extracting archive ${
						basename(
							zipFilePath,
						)
					} to temporary directory...`,
				),
			);
			if (!(await unzipArchive(zipFilePath, tempDir))) {
				return false;
			}

			if (!isProfileSwitch && !skipBackup) {
				console.log(
					chalk.gray(
						`Creating automatic pre-restore backup of current settings...`,
					),
				);
				const autoBackupFile = await createTimestampedBackup(
					APP_PATHS.AUTO_BACKUP_DIR,
					"pre-restore",
					componentOptions,
				);
				if (autoBackupFile) {
					console.log(
						chalk.gray(
							`Automatic backup created at ${autoBackupFile}`,
						),
					);
				} else {
					console.warn(
						chalk.yellow(
							"Warning: Automatic pre-restore backup creation may have failed. Continuing with restore...",
						),
					);
				}
			} else if (!isProfileSwitch && skipBackup) {
				console.log(
					chalk.gray("Skipping automatic pre-restore backup (disabled by --no-backup option)."),
				);
			}

			console.log(
				chalk.gray(`Removing existing Cinnamon file-based settings...`),
			);
			if (await exists(CINNAMON_PATHS.SHARE_DIR_ABSOLUTE)) {
				await emptyDir(CINNAMON_PATHS.SHARE_DIR_ABSOLUTE);
			}
			if (await exists(CINNAMON_PATHS.CONFIG_DIR_ABSOLUTE)) {
				await emptyDir(CINNAMON_PATHS.CONFIG_DIR_ABSOLUTE);
			}
			// ensure dirs exist after emptying, as emptyDir might remove them if they were empty before.
			await Deno.mkdir(CINNAMON_PATHS.SHARE_DIR_ABSOLUTE, {
				recursive: true,
			});
			await Deno.mkdir(CINNAMON_PATHS.CONFIG_DIR_ABSOLUTE, {
				recursive: true,
			});

			console.log(chalk.gray(`Restoring file-based settings...`));
			const tempShareDir = join(tempDir, "share");
			const tempConfigDir = join(tempDir, "config");

			if (await exists(tempShareDir)) {
				await copyDirectoryContents(
					tempShareDir,
					CINNAMON_PATHS.SHARE_DIR_ABSOLUTE,
				);
			} else {
				console.warn(
					chalk.yellow(
						"Warning: No 'share' directory found in the archive.",
					),
				);
			}
			if (await exists(tempConfigDir)) {
				await copyDirectoryContents(
					tempConfigDir,
					CINNAMON_PATHS.CONFIG_DIR_ABSOLUTE,
				);
			} else {
				console.warn(
					chalk.yellow(
						"Warning: No 'config' directory found in the archive.",
					),
				);
			}

			// restore themes, icons, and fonts
			await restoreThemeIconAndFontDirectories(tempDir, componentOptions);

			// restore dconf settings
			if (componentOptions.dconf) {
				const dconfSettingsPath = join(tempDir, DCONF_SETTINGS_FILE);
				if (await exists(dconfSettingsPath)) {
					console.log(
						chalk.gray(
							`Clearing existing dconf settings for /org/cinnamon/...`,
						),
					);
					
					// reset/clear all existing Cinnamon dconf settings first
					const dconfResetResult = await executeCommand("dconf", [
						"reset",
						"-f",
						"/org/cinnamon/",
					]);
					
					if (dconfResetResult.success) {
						console.log(
							chalk.gray(
								"Existing dconf settings cleared successfully.",
							),
						);
					} else {
						console.warn(
							chalk.yellow(
								`Warning: Failed to clear existing dconf settings for /org/cinnamon/. Continuing with restore...`,
							),
						);
						console.warn(
							chalk.gray(
								`dconf reset stderr: ${dconfResetResult.stderr}`,
							),
						);
					}

					console.log(
						chalk.gray(
							`Restoring dconf settings for /org/cinnamon/ from ${
								basename(
									dconfSettingsPath,
								)
							}...`,
						),
					);
					try {
						const dconfSettingsContent = await Deno.readTextFile(
							dconfSettingsPath,
						);
						if (dconfSettingsContent.trim() === "") {
							console.log(
								chalk.gray(
									`dconf settings file ${
										basename(
											dconfSettingsPath,
										)
									} is empty. Skipping dconf load.`,
								),
							);
						} else {
							const dconfLoadResult = await executeCommand(
								"dconf",
								["load", "/org/cinnamon/"],
								{
									stdinContent: dconfSettingsContent,
								},
							);

							if (dconfLoadResult.success) {
								console.log(
									chalk.gray(
										"dconf settings for /org/cinnamon/ restored successfully.",
									),
								);
							} else {
								console.warn(
									chalk.yellow(
										`Warning: Failed to restore dconf settings for /org/cinnamon/.`,
									),
								);
								console.warn(
									chalk.gray(
										`dconf stderr: ${dconfLoadResult.stderr}`,
									),
								);
							}
						}
					} catch (e) {
						console.warn(
							chalk.yellow(
								`Warning: Error reading dconf settings file ${
									basename(
										dconfSettingsPath,
									)
								}: ${
									e instanceof Error ? e.message : String(e)
								}. Skipping dconf restore.`,
							),
						);
					}
				} else {
					console.log(
						chalk.gray(
							`No dconf settings file (${DCONF_SETTINGS_FILE}) found in archive. Skipping dconf restore.`,
						),
					);
				}
			} else {
				console.log(chalk.gray("Skipping dconf settings restoration (disabled by option)."));
			}

			return true;
		},
	);
}

/**
 * Restore settings from a user-selected backup.
 */
async function restoreBackupCmd(options: CommandOptions): Promise<void> {
	const componentOptions: ComponentOptions = {
		userThemes: options.userThemes !== false,
		systemThemes: options.addSystemThemes === true,
		userIcons: options.userIconsLocal !== false,
		userIconsAlt: options.userIconsHome !== false,
		systemIcons: options.addSystemIcons === true,
		userFonts: options.userFontsLocal !== false,
		userFontsAlt: options.userFontsHome !== false,
		systemFonts: options.addSystemFonts === true,
		dconf: options.dconf !== false,
	};

	const backupFilePath = await selectBackupFile();
	if (!backupFilePath) {
		Deno.exit(0);
	}
	console.log(
		chalk.yellow(
			`Restoring settings from backup: ${basename(backupFilePath)}`,
		),
	);

	const success = await restoreSettingsFromZip(backupFilePath, false, componentOptions, options.noBackup);

	if (success) {
		console.log(chalk.green("Settings restored successfully from backup."));
		console.log(
			chalk.gray(
				"You may need to restart Cinnamon or log out/in for all changes to take effect.",
			),
		);
	} else {
		console.error(chalk.red("Failed to restore settings from backup."));
		Deno.exit(1);
	}
}

/**
 * Select a backup file to restore. Returns full path or null.
 */
async function selectBackupFile(): Promise<string | null> {
	if (
		!(await exists(APP_PATHS.BACKUP_DIR)) &&
		!(await exists(APP_PATHS.AUTO_BACKUP_DIR))
	) {
		console.log(
			chalk.yellow("No backup directories found. Nothing to restore."),
		);
		return null;
	}

	const filesWithDates: {
		filename: string;
		date: Date | null;
		fullPath: string;
		type: string;
	}[] = [];

	// process manual backups
	if (await exists(APP_PATHS.BACKUP_DIR)) {
		for await (const dirEntry of Deno.readDir(APP_PATHS.BACKUP_DIR)) {
			if (dirEntry.isFile && dirEntry.name.endsWith(".zip")) {
				let date: Date | null = null;
				const dateMatch = dirEntry.name.match(
					/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.zip$/,
				);
				if (dateMatch) {
					const datePart = dateMatch[1];
					const isoStr = datePart.substring(0, 13) +
						":" +
						datePart.substring(14, 16) +
						":" +
						datePart.substring(17, 19) +
						"." +
						datePart.substring(20, 23) +
						"Z";
					try {
						date = new Date(isoStr);
						if (isNaN(date.getTime())) {
							console.log(
								chalk.gray(
									`Could not parse date from: ${dirEntry.name}, produced: ${isoStr}`,
								),
							);
							date = null;
						}
					} catch (e) {
						console.log(
							chalk.gray(
								`Error parsing date: ${
									e instanceof Error ? e.message : "Unknown"
								}`,
							),
						);
					}
				}
				filesWithDates.push({
					filename: dirEntry.name,
					date,
					fullPath: join(APP_PATHS.BACKUP_DIR, dirEntry.name),
					type: "Manual",
				});
			}
		}
	}

	// process auto backups
	if (await exists(APP_PATHS.AUTO_BACKUP_DIR)) {
		for await (const dirEntry of Deno.readDir(APP_PATHS.AUTO_BACKUP_DIR)) {
			if (dirEntry.isFile && dirEntry.name.endsWith(".zip")) {
				let date: Date | null = null;
				const dateMatch = dirEntry.name.match(
					/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.zip$/,
				);
				if (dateMatch) {
					const datePart = dateMatch[1];
					const isoStr = datePart.substring(0, 13) +
						":" +
						datePart.substring(14, 16) +
						":" +
						datePart.substring(17, 19) +
						"." +
						datePart.substring(20, 23) +
						"Z";
					try {
						date = new Date(isoStr);
						if (isNaN(date.getTime())) {
							console.log(
								chalk.gray(
									`Could not parse date from: ${dirEntry.name}, produced: ${isoStr}`,
								),
							);
							date = null;
						}
					} catch (e) {
						console.log(
							chalk.gray(
								`Error parsing date: ${
									e instanceof Error ? e.message : "Unknown"
								}`,
							),
						);
					}
				}
				filesWithDates.push({
					filename: dirEntry.name,
					date,
					fullPath: join(APP_PATHS.AUTO_BACKUP_DIR, dirEntry.name),
					type: "Auto",
				});
			}
		}
	}

	if (filesWithDates.length === 0) {
		console.log(
			chalk.yellow("No backup files found in the backup directories."),
		);
		return null;
	}

	filesWithDates.sort((a, b) => {
		if (!a.date && !b.date) return a.filename.localeCompare(b.filename); // fallback sort by name
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.getTime() - a.date.getTime(); // newest first
	});

	console.log(
		chalk.yellow("Available backup files (both manual and automatic):"),
	);
	const table = new Table()
		.header(["#", "Backup File", "Date", "Type"])
		.padding(2)
		.border(true);
	filesWithDates.forEach(({ filename, date, type }, index) => {
		table.push([
			`${index + 1}`,
			filename,
			date ? date.toLocaleString() : "Unknown",
			type,
		]);
	});
	console.log(table.toString());

	const input = prompt(
		chalk.yellow(
			"Enter the number of the backup to restore (or 0 to cancel):",
		),
	);
	if (input === null) {
		console.log(chalk.gray("Restore cancelled by user."));
		return null;
	}
	const selection = parseInt(input);

	if (
		isNaN(selection) ||
		selection < 0 ||
		selection > filesWithDates.length
	) {
		console.error(
			chalk.red(
				`Error: Invalid selection. Please enter a number between 0 and ${filesWithDates.length}.`,
			),
		);
		return null;
	}
	if (selection === 0) {
		console.log(chalk.gray("Restore cancelled."));
		return null;
	}
	return filesWithDates[selection - 1].fullPath;
}

/**
 * Switch to a different profile
 */
async function switchProfile(name: string, options: CommandOptions): Promise<void> {
	const profiles = await readProfiles();
	const profileToActivate = profiles.find((p) => p.name === name);

	if (!profileToActivate) {
		console.error(chalk.red(`Error: Profile "${name}" not found.`));
		Deno.exit(1);
	}

	// ask for confirmation before switching, as it will override current settings
	const confirmMessage = profileToActivate.active
		? chalk.yellow(
			`Profile "${name}" is already active. Re-applying it will reset any unsaved changes. Continue?`,
		)
		: chalk.yellow(
			`Switching to profile "${name}" will override your current settings. Continue?`,
		);

	const proceed = confirm(confirmMessage);
	if (!proceed) {
		console.log(chalk.gray("Profile switch cancelled by user."));
		Deno.exit(0);
	}
	console.log(chalk.yellow(`Switching to profile: ${name}`));
	
	const componentOptions: ComponentOptions = {
		userThemes: options.userThemes !== false,
		systemThemes: options.addSystemThemes === true,
		userIcons: options.userIconsLocal !== false,
		userIconsAlt: options.userIconsHome !== false,
		systemIcons: options.addSystemIcons === true,
		userFonts: options.userFontsLocal !== false,
		userFontsAlt: options.userFontsHome !== false,
		systemFonts: options.addSystemFonts === true,
		dconf: options.dconf !== false,
	};
	
	let autoBackupFile: string | null = null;
	if (!options.noBackup) {
		console.log(
			chalk.gray(`Creating backup of current settings before switching...`),
		);
		autoBackupFile = await createTimestampedBackup(
			APP_PATHS.AUTO_BACKUP_DIR,
			`pre-switch-to-${name.replace(/[^a-zA-Z0-9-_]/g, "_")}`,
			componentOptions,
		);
		if (autoBackupFile) {
			console.log(
				chalk.gray(
					`Automatic backup created at ${basename(autoBackupFile)}`,
				),
			);
		} else {
			const proceed = confirm(
				chalk.redBright(
					"Automatic backup failed. Continue switching profile anyway? (Not Recommended)",
				),
			);
			if (!proceed) {
				console.log(chalk.red("Profile switch aborted by user."));
				Deno.exit(0);
			}
			console.warn(
				chalk.yellow("Proceeding with switch despite backup failure..."),
			);
		}
	} else {
		console.log(
			chalk.gray("Skipping automatic backup (disabled by --no-backup option)."),
		);
	}

	const success = await restoreSettingsFromZip(
		profileToActivate.zipFile,
		true,
		componentOptions,
		true, // skip backup since we handle it manually above
	);

	if (success) {
		profiles.forEach((p) => (p.active = p.name === name));
		profileToActivate.lastModified = new Date().toISOString(); // update lastModified on successful switch
		await writeProfiles(profiles);
		console.log(chalk.green(`Profile "${name}" switched successfully.`));
		console.log(
			chalk.gray(
				"You may need to restart Cinnamon or log out/in for all changes to take effect.",
			),
		);
	} else {
		console.error(
			chalk.red(
				`Failed to switch to profile "${name}". Current settings might be in an inconsistent state.`,
			),
		);
		console.error(
			chalk.yellow(
				`An automatic backup was attempted: ${
					autoBackupFile
						? basename(autoBackupFile)
						: "Not created or failed"
				}. You might need to restore it manually.`,
			),
		);
		Deno.exit(1);
	}
}

/**
 * Delete an existing profile
 */
async function deleteProfile(name: string): Promise<void> {
	console.log(chalk.yellow(`Deleting profile: ${name}`));
	const profiles = await readProfiles();
	const profileIndex = profiles.findIndex((p) => p.name === name);

	if (profileIndex === -1) {
		console.error(chalk.red(`Error: Profile "${name}" not found.`));
		Deno.exit(1);
	}

	const profileToDelete = profiles[profileIndex];

	try {
		if (await exists(profileToDelete.zipFile)) {
			await Deno.remove(profileToDelete.zipFile);
			console.log(
				chalk.gray(
					`Deleted profile archive: ${
						basename(
							profileToDelete.zipFile,
						)
					}`,
				),
			);
		} else {
			console.warn(
				chalk.yellow(
					`Warning: Profile archive not found: ${
						basename(
							profileToDelete.zipFile,
						)
					}`,
				),
			);
		}
	} catch (error) {
		console.error(
			chalk.red(
				`Error deleting profile archive ${
					basename(
						profileToDelete.zipFile,
					)
				}: ${error instanceof Error ? error.message : "Unknown error"}`,
			),
		);
	}

	profiles.splice(profileIndex, 1);
	await writeProfiles(profiles);
	console.log(
		chalk.green(`Profile "${name}" deleted successfully from records.`),
	);
}

/**
 * Reset the application (delete profile directory)
 */
async function resetApplication(): Promise<void> {
	console.log(
		chalk.redBright.bold(
			"WARNING: This will delete ALL profiles, backups, and manager settings!",
		),
	);
	const confirm1 = confirm(
		chalk.yellow("Are you absolutely sure you want to continue?"),
	);
	if (!confirm1) {
		console.log(chalk.gray("Reset aborted."));
		Deno.exit(0);
	}
	console.log(
		chalk.redBright("This action CANNOT be undone. All data in ") +
			chalk.cyan(APP_PATHS.CUSTOM_PROFILES_ROOT_DIR) +
			chalk.redBright(" will be lost."),
	);
	const confirm2 = confirm(
		chalk.yellow("Final confirmation: Delete everything?"),
	);
	if (!confirm2) {
		console.log(chalk.gray("Reset aborted."));
		Deno.exit(0);
	}

	try {
		console.log(
			chalk.gray(
				`Deleting directory: ${APP_PATHS.CUSTOM_PROFILES_ROOT_DIR}`,
			),
		);
		await Deno.remove(APP_PATHS.CUSTOM_PROFILES_ROOT_DIR, {
			recursive: true,
		});
		console.log(chalk.green("Application reset successfully."));
		console.log(
			chalk.gray(
				"All profiles, backups, and settings have been deleted. The profiles directory will be recreated on next run.",
			),
		);
	} catch (error) {
		console.error(
			chalk.red(
				`Error during reset: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			),
		);
		console.error(
			chalk.yellow(
				"The application data directory might be in an inconsistent state.",
			),
		);
		Deno.exit(1);
	}
}

/**
 * Export a profile to a user-specified location (Downloads or Home).
 */
async function exportProfile(name: string): Promise<void> {
	console.log(chalk.yellow(`Exporting profile: ${name}`));
	const profiles = await readProfiles();
	const profile = profiles.find((p) => p.name === name);
	if (!profile) {
		console.error(chalk.red(`Error: Profile "${name}" not found.`));
		Deno.exit(1);
	}

	const success = await withTempDir(
		{ prefix: "cinnamon-export-" },
		async (tempDir) => {
			console.log(
				chalk.gray(
					`Extracting profile data from ${
						basename(
							profile.zipFile,
						)
					}...`,
				),
			);
			if (!(await unzipArchive(profile.zipFile, tempDir))) {
				return false;
			}

			const profileMeta = {
				appName: PROGRAM_NAME,
				appVersion: VERSION,
				profileName: profile.name,
				exportedAt: new Date().toISOString(),
				originalCreatedAt: profile.lastModified, // this is actually last activated/created
				description:
					`Exported Cinnamon desktop profile: ${profile.name}`,
			};
			await Deno.writeTextFile(
				join(tempDir, "cinnamon-profile-manager-metadata.json"),
				JSON.stringify(profileMeta, null, 2),
			);

			const downloadsDir = ENV.HOME ? join(ENV.HOME, "Downloads") : null;
			let targetDir = ENV.HOME!; // fallback to HOME
			if (downloadsDir) {
				try {
					if (
						(await exists(downloadsDir)) &&
						(await Deno.stat(downloadsDir)).isDirectory
					) {
						targetDir = downloadsDir;
					}
				} catch (_e) {
					/* ignore if Downloads dir check fails, use HOME */
				}
			}

			const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "_");
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const exportFileName =
				`cinnamon-profile-${safeName}-export-${timestamp}.zip`;
			const exportPath = join(targetDir, exportFileName);

			console.log(
				chalk.gray(`Creating export archive at ${exportPath}...`),
			);
			if (!(await zipDirectoryContents(tempDir, exportPath))) {
				// zipDirectoryContents now zips "."
				console.error(chalk.red("Failed to create export archive."));
				return false;
			}
			console.log(
				chalk.green(`Profile exported successfully to ${exportPath}`),
			);
			return true;
		},
	);
	if (!success) {
		Deno.exit(1);
	}
}

/**
 * Import a profile from an external zip file.
 */
async function importProfile(filepath: string): Promise<void> {
	console.log(chalk.yellow(`Importing profile from: ${filepath}`));
	if (!(await exists(filepath))) {
		console.error(chalk.red(`Error: File not found: ${filepath}`));
		Deno.exit(1);
	}

	await withTempDir({ prefix: "cinnamon-import-" }, async (tempDir) => {
		console.log(chalk.gray("Extracting profile archive..."));
		if (!(await unzipArchive(filepath, tempDir))) {
			Deno.exit(1);
		}

		let profileName = basename(filepath, ".zip")
			.replace(/^cinnamon-profile-/i, "")
			.replace(
				/-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/i,
				"",
			)
			.replace(/[^a-zA-Z0-9-_]/g, "_") || `imported-${Date.now()}`;

		const metadataPath = join(
			tempDir,
			"cinnamon-profile-manager-metadata.json",
		);
		if (await exists(metadataPath)) {
			try {
				const metadata = JSON.parse(
					await Deno.readTextFile(metadataPath),
				);
				if (
					metadata.profileName &&
					typeof metadata.profileName === "string"
				) {
					profileName = metadata.profileName.replace(
						/[^a-zA-Z0-9-_]/g,
						"_",
					);
					console.log(
						chalk.gray(
							`Found metadata. Original profile name (sanitized): "${profileName}"`,
						),
					);
				}
			} catch (e) {
				console.warn(
					chalk.yellow(
						`Warning: Could not parse metadata file: ${
							e instanceof Error ? e.message : "Unknown error"
						}`,
					),
				);
			}
		}

		const newNameInput = prompt(
			chalk.yellow(
				`Enter name for this imported profile (default: "${profileName}"):`,
			),
			profileName,
		);
		if (newNameInput !== null && newNameInput.trim() !== "") {
			profileName = newNameInput.trim().replace(/[^a-zA-Z0-9-_]/g, "_");
		}
		if (!profileName) {
			// ensure profileName is not empty after sanitization or user input
			profileName = `imported-profile-${Date.now()}`;
			console.log(
				chalk.yellow(
					`Profile name was empty, using generated name: "${profileName}"`,
				),
			);
		}

		const profiles = await readProfiles();
		const existingProfileIndex = profiles.findIndex(
			(p) => p.name === profileName,
		);

		if (existingProfileIndex !== -1) {
			const overwrite = confirm(
				chalk.yellow(
					`A profile named "${profileName}" already exists. Overwrite?`,
				),
			);
			if (!overwrite) {
				console.log(chalk.red("Import cancelled."));
				Deno.exit(0);
			}
			const oldProfile = profiles[existingProfileIndex];
			try {
				if (await exists(oldProfile.zipFile)) {
					await Deno.remove(oldProfile.zipFile);
				}
			} catch (e) {
				console.warn(
					chalk.yellow(
						`Could not delete old zip ${
							basename(
								oldProfile.zipFile,
							)
						}: ${e instanceof Error ? e.message : "Unknown error"}`,
					),
				);
			}
			profiles.splice(existingProfileIndex, 1);
		}

		// the tempDir now contains the extracted contents (share/, config/, dconf.ini, metadata.json etc.)
		// we need to re-zip these into our internal profile format.
		const newZipFile = join(
			APP_PATHS.CUSTOM_PROFILES_ROOT_DIR,
			`${profileName}-${crypto.randomUUID()}.zip`,
		);
		console.log(
			chalk.gray(
				`Creating internal profile archive ${basename(newZipFile)}...`,
			),
		);
		if (!(await zipDirectoryContents(tempDir, newZipFile))) {
			console.error(
				chalk.red(
					"Failed to create internal profile archive from imported data.",
				),
			);
			Deno.exit(1);
		}

		profiles.push({
			name: profileName,
			active: false, // imported profiles are not active by default
			lastModified: new Date().toISOString(), // set lastModified to import time
			zipFile: newZipFile,
		});
		await writeProfiles(profiles);

		console.log(
			chalk.green(`Profile "${profileName}" imported successfully.`),
		);
		console.log(
			chalk.gray(
				`Use '${PROGRAM_NAME} switch "${profileName}"' to activate this profile.`,
			),
		);
	});
}

/**
 * Updates the currently active profile with current Cinnamon settings
 */
async function updateActiveProfile(options: CommandOptions): Promise<void> {
	const componentOptions: ComponentOptions = {
		userThemes: options.userThemes !== false,
		systemThemes: options.addSystemThemes === true,
		userIcons: options.userIconsLocal !== false,
		userIconsAlt: options.userIconsHome !== false,
		systemIcons: options.addSystemIcons === true,
		userFonts: options.userFontsLocal !== false,
		userFontsAlt: options.userFontsHome !== false,
		systemFonts: options.addSystemFonts === true,
		dconf: options.dconf !== false,
	};

	console.log(
		chalk.yellow("Updating active profile with current settings..."),
	);
	const profiles = await readProfiles();

	const activeProfile = profiles.find((p) => p.active);
	if (!activeProfile) {
		console.error(
			chalk.red(
				"Error: No active profile found. Create or switch to a profile first.",
			),
		);
		Deno.exit(1);
	}

	console.log(chalk.gray(`Found active profile: ${activeProfile.name}`));

	const confirmed = confirm(
		chalk.yellow(
			`This will update "${activeProfile.name}" with your current settings. Continue?`,
		),
	);
	if (!confirmed) {
		console.log(chalk.gray("Update cancelled."));
		Deno.exit(0);
	}

	// create backup before updating
	console.log(chalk.gray("Creating backup before updating profile..."));
	const backupFile = await createTimestampedBackup(
		APP_PATHS.AUTO_BACKUP_DIR,
		`pre-update-${activeProfile.name.replace(/[^a-zA-Z0-9-_]/g, "_")}`,
		componentOptions,
	);

	if (backupFile) {
		console.log(chalk.gray(`Backup created at: ${basename(backupFile)}`));
	} else {
		const proceed = confirm(
			chalk.redBright(
				"Failed to create pre-update backup. Continue anyway? (Not Recommended)",
			),
		);
		if (!proceed) {
			console.log(chalk.red("Update cancelled."));
			Deno.exit(0);
		}
		console.warn(
			chalk.yellow("Proceeding with update despite backup failure..."),
		);
	}

	const success = await withTempDir(
		{ prefix: "cinnamon-profile-update-" },
		async (tempDir) => {
			const tempShareDir = join(tempDir, "share");
			const tempConfigDir = join(tempDir, "config");

			console.log(
				chalk.gray("Copying current Cinnamon file-based settings..."),
			);
			await copyDirectoryContents(
				CINNAMON_PATHS.SHARE_DIR_ABSOLUTE,
				tempShareDir,
			);
			await copyDirectoryContents(
				CINNAMON_PATHS.CONFIG_DIR_ABSOLUTE,
				tempConfigDir,
			);

			// copy themes, icons, and fonts for update
			await copyThemeIconAndFontDirectories(tempDir, componentOptions);

			// dump dconf settings
			if (componentOptions.dconf) {
				const dconfDumpPath = join(tempDir, DCONF_SETTINGS_FILE);
				console.log(
					chalk.gray(
						`Dumping dconf settings for /org/cinnamon/ to ${
							basename(
								dconfDumpPath,
							)
						}...`,
					),
				);
				const dconfDumpResult = await executeCommand("dconf", [
					"dump",
					"/org/cinnamon/",
				]);
				if (dconfDumpResult.success && dconfDumpResult.stdout) {
					await Deno.writeTextFile(dconfDumpPath, dconfDumpResult.stdout);
					console.log(chalk.gray("dconf settings dumped successfully."));
				} else {
					console.warn(
						chalk.yellow(
							`Warning: Failed to dump dconf settings for /org/cinnamon/. Profile will be updated without them.`,
						),
					);
					console.warn(
						chalk.gray(`dconf stderr: ${dconfDumpResult.stderr}`),
					);
				}
			} else {
				console.log(chalk.gray("Skipping dconf settings update (disabled by option)."));
			}

			// delete the old zip file
			try {
				if (await exists(activeProfile.zipFile)) {
					await Deno.remove(activeProfile.zipFile);
					console.log(
						chalk.gray(
							`Deleted old profile archive: ${
								basename(
									activeProfile.zipFile,
								)
							}`,
						),
					);
				}
			} catch (error) {
				console.warn(
					chalk.yellow(
						`Warning: Failed to delete old profile archive. Creating new file anyway.`,
					),
				);
				console.warn(
					chalk.gray(
						`Error: ${
							error instanceof Error
								? error.message
								: "Unknown error"
						}`,
					),
				);
			}

			// create new zip with the same filename
			console.log(chalk.gray(`Creating updated profile archive...`));
			if (!(await zipDirectoryContents(tempDir, activeProfile.zipFile))) {
				return false;
			}

			// update the lastModified timestamp
			activeProfile.lastModified = new Date().toISOString();
			await writeProfiles(profiles);

			return true;
		},
	);

	if (success) {
		console.log(
			chalk.green(
				`Profile "${activeProfile.name}" updated successfully with current settings.`,
			),
		);
	} else {
		console.error(
			chalk.red(`Failed to update profile "${activeProfile.name}".`),
		);
		console.error(
			chalk.yellow(
				`A backup was attempted before the update: ${
					backupFile ? basename(backupFile) : "Failed"
				}`,
			),
		);
		Deno.exit(1);
	}
}

/**
 * Backup current settings manually.
 */
async function backupCurrentSettingsCmd(options: CommandOptions): Promise<void> {
	const componentOptions: ComponentOptions = {
		userThemes: options.userThemes !== false,
		systemThemes: options.addSystemThemes === true,
		userIcons: options.userIconsLocal !== false,
		userIconsAlt: options.userIconsHome !== false,
		systemIcons: options.addSystemIcons === true,
		userFonts: options.userFontsLocal !== false,
		userFontsAlt: options.userFontsHome !== false,
		systemFonts: options.addSystemFonts === true,
		dconf: options.dconf !== false,
	};

	console.log(chalk.yellow("Backing up current settings..."));
	const backupFile = await createTimestampedBackup(
		APP_PATHS.BACKUP_DIR,
		"manual-backup",
		componentOptions,
	);
	if (backupFile) {
		console.log(chalk.green(`Backup created successfully @ ${backupFile}`));
	} else {
		console.error(chalk.red("Failed to create backup archive."));
		Deno.exit(1);
	}
}

// --- main application setup and execution ---
async function main(): Promise<void> {
	const zipPath = await getCommandPath("zip");
	const unzipPath = await getCommandPath("unzip");
	const dconfPath = await getCommandPath("dconf"); // check for dconf

	const missingDeps = [];
	if (!zipPath) missingDeps.push("zip");
	if (!unzipPath) missingDeps.push("unzip");
	if (!dconfPath) missingDeps.push("dconf"); // add dconf to dependency check

	if (missingDeps.length > 0) {
		console.error(
			chalk.red(
				`Error: Required command(s) not found in PATH: ${
					missingDeps.join(
						", ",
					)
				}. Please install them and try again.`,
			),
		);
		Deno.exit(1);
	}

	await ensureAppDirectories();
	printHeader();

	const program = new Command()
		.name(PROGRAM_NAME)
		.description(
			"A tool for managing Cinnamon desktop environment profiles. Includes settings, spices, panels, etc.",
		)
		.version(VERSION);

	program
		.command("list")
		.alias("ls")
		.description("List all available profiles.")
		.action(listProfiles);

	program
		.command("create")
		.argument("<name>", "Name for the new profile.")
		.description(
			"Create a new profile from current Cinnamon settings (files, dconf, themes, icons, and fonts).",
		)
		.option("--no-user-themes", "Skip user themes from ~/.themes")
		.option("--add-system-themes", "Include system themes from /usr/share/themes (may have permission issues and take a long time)")
		.option("--no-user-icons-local", "Skip user icons from ~/.local/share/icons")
		.option("--no-user-icons-home", "Skip user icons from ~/.icons")
		.option("--add-system-icons", "Include system icons from /usr/share/icons (may have permission issues and take a long time)")
		.option("--no-user-fonts-local", "Skip user fonts from ~/.local/share/fonts")
		.option("--no-user-fonts-home", "Skip user fonts from ~/.fonts")
		.option("--add-system-fonts", "Include system fonts from /usr/share/fonts (may have permission issues and take a long time)")
		.option("--no-dconf", "Skip dconf settings")
		.action(createProfile);

	program
		.command("switch")
		.argument("<name>", "Name of the profile to switch to.")
		.description(
			"Switch to a different profile (restores files, dconf, themes, icons, and fonts).",
		)
		.option("--no-user-themes", "Skip restoring user themes to ~/.themes")
		.option("--add-system-themes", "Include restoring system themes to /usr/share/themes (may have permission issues and take a long time)")
		.option("--no-user-icons-local", "Skip restoring user icons to ~/.local/share/icons")
		.option("--no-user-icons-home", "Skip restoring user icons to ~/.icons")
		.option("--add-system-icons", "Include restoring system icons to /usr/share/icons (may have permission issues and take a long time)")
		.option("--no-user-fonts-local", "Skip restoring user fonts to ~/.local/share/fonts")
		.option("--no-user-fonts-home", "Skip restoring user fonts to ~/.fonts")
		.option("--add-system-fonts", "Include restoring system fonts to /usr/share/fonts (may have permission issues and take a long time)")
		.option("--no-dconf", "Skip restoring dconf settings")
		.option("--no-backup", "Skip creating automatic backup before switching")
		.action(switchProfile);

	program
		.command("delete")
		.alias("rm")
		.argument("<name>", "Name of the profile to delete.")
	
		.description("Delete an existing profile.")
		.action(deleteProfile);

	program
		.command("backup")
		.description(
			"Create a manual backup of current Cinnamon settings (files, dconf, themes, icons, and fonts).",
		)
		.option("--no-user-themes", "Skip user themes from ~/.themes")
		.option("--add-system-themes", "Include system themes from /usr/share/themes (may have permission issues and take a long time)")
		.option("--no-user-icons-local", "Skip user icons from ~/.local/share/icons")
		.option("--no-user-icons-home", "Skip user icons from ~/.icons")
		.option("--add-system-icons", "Include system icons from /usr/share/icons (may have permission issues and take a long time)")
		.option("--no-user-fonts-local", "Skip user fonts from ~/.local/share/fonts")
		.option("--no-user-fonts-home", "Skip user fonts from ~/.fonts")
		.option("--add-system-fonts", "Include system fonts from /usr/share/fonts (may have permission issues and take a long time)")
		.option("--no-dconf", "Skip dconf settings")
		.action(backupCurrentSettingsCmd);

	program
		.command("restore")
		.description(
			"Restore Cinnamon settings from a manual backup (files, dconf, themes, icons, and fonts).",
		)
		.option("--no-user-themes", "Skip restoring user themes to ~/.themes")
		.option("--add-system-themes", "Include restoring system themes to /usr/share/themes (may have permission issues and take a long time)")
		.option("--no-user-icons-local", "Skip restoring user icons to ~/.local/share/icons")
		.option("--no-user-icons-home", "Skip restoring user icons to ~/.icons")
		.option("--add-system-icons", "Include restoring system icons to /usr/share/icons (may have permission issues and take a long time)")
		.option("--no-user-fonts-local", "Skip restoring user fonts to ~/.local/share/fonts")
		.option("--no-user-fonts-home", "Skip restoring user fonts to ~/.fonts")
		.option("--add-system-fonts", "Include restoring system fonts to /usr/share/fonts (may have permission issues and take a long time)")
		.option("--no-dconf", "Skip restoring dconf settings")
		.option("--no-backup", "Skip creating automatic backup before restoring")
		.action(restoreBackupCmd);

	program
		.command("list-backups")
		.alias("lb")
		.description("List all available backup files (manual and automatic).")
		.action(listBackups);

	program
		.command("export")
		.argument("<name>", "Name of the profile to export.")
		.description(
			"Export a profile to an external zip file (includes dconf settings, themes, icons, and fonts if present).",
		)
		.action(exportProfile);

	program
		.command("import")
		.argument("<filepath>", "Path to the profile zip file to import.")
		.description(
			"Import a profile from an external zip file (applies dconf, themes, icons, and fonts if present).",
		)
		.action(importProfile);

	program
		.command("update")
		.alias("up")
		.description(
			"Update the currently active profile with current settings (including themes, icons, and fonts).",
		)
		.option("--no-user-themes", "Skip user themes from ~/.themes")
		.option("--add-system-themes", "Include system themes from /usr/share/themes (may have permission issues and take a long time)")
		.option("--no-user-icons-local", "Skip user icons from ~/.local/share/icons")
		.option("--no-user-icons-home", "Skip user icons from ~/.icons")
		.option("--add-system-icons", "Include system icons from /usr/share/icons (may have permission issues and take a long time)")
		.option("--no-user-fonts-local", "Skip user fonts from ~/.local/share/fonts")
		.option("--no-user-fonts-home", "Skip user fonts from ~/.fonts")
		.option("--add-system-fonts", "Include system fonts from /usr/share/fonts (may have permission issues and take a long time)")
		.option("--no-dconf", "Skip dconf settings")
		.action(updateActiveProfile);

	program
		.command("reset")
		.description(
			"DANGER: Delete all profiles, backups, and manager settings.",
		)
		.action(resetApplication);

	if (Deno.args.length === 0) {
		program.outputHelp();
		// optionally, list profiles by default if no command is given
		// console.log("\n" + chalk.blue("Tip: Run 'list' to see available profiles or --help for all commands."));
		// await listProfiles(); // uncomment to list profiles by default
		Deno.exit(0);
	}

	try {
		await program.parseAsync();
	} catch (error) {
		// commander typically handles its own errors and exits.
		// this catch is for unexpected errors during parsing itself.

		interface CommanderError extends Error {
			code?: string;
		}

		if (
			error instanceof Error &&
			(error as CommanderError).code === "commander.unknownCommand"
		) {
			// already handled by Commander
		} else if (
			error instanceof Error &&
			(error as CommanderError).code === "commander.missingArgument"
		) {
			// already handled by Commander
		} else {
			console.error(
				chalk.red(
					`Unhandled error during command parsing: ${
						error instanceof Error ? error.message : String(error)
					}`,
				),
			);
		}
		Deno.exit(1);
	}
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(
			chalk.redBright(
				`\nCritical error in main execution: ${err.message}`,
			),
		);
		if (err.stack) {
			console.error(chalk.gray(err.stack));
		}
		Deno.exit(1);
	});
}
