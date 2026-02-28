/**
 * csesh — Claude Code session manager
 * Copyright (c) 2025-2026 Arthur Pacaud (@ArthurPcd)
 * Licensed under Apache-2.0
 * https://github.com/ArthurPcd/csesh
 */

/**
 * Minimal CLI framework — replaces commander with zero dependencies.
 * Supports: commands, nested subcommands, typed options, arguments,
 * variadic arguments, auto-generated help, version flag.
 */

import { parseArgs } from 'node:util';

class Command {
  constructor(name = '', description = '') {
    this._name = name;
    this._description = description;
    this._commands = new Map();
    this._options = [];       // { flags, short, long, takesValue, description, default, parse }
    this._arguments = [];     // { name, required, variadic }
    this._action = null;
    this._version = null;
    this._helpFormatter = null;
    this._parent = null;
  }

  name(n) { if (n !== undefined) { this._name = n; return this; } return this._name; }
  description(d) { if (d !== undefined) { this._description = d; return this; } return this._description; }

  version(v) {
    this._version = v;
    return this;
  }

  configureHelp(cfg) {
    this._helpFormatter = cfg?.formatHelp || null;
    return this;
  }

  command(name) {
    // Parse inline arguments: 'search <query>' or 'show <id>' or 'analyze [id]'
    const parts = name.split(/\s+/);
    const cmdName = parts[0];
    const cmd = new Command(cmdName);
    cmd._parent = this;
    for (let i = 1; i < parts.length; i++) {
      cmd.argument(parts[i]);
    }
    this._commands.set(cmdName, cmd);
    return cmd;
  }

  option(flags, description = '', parseOrDefault, defaultValue) {
    // Parse flags: "-p, --project <name>" or "--json" or "--dry-run"
    const parts = flags.split(/,\s*/);
    let short = null;
    let long = null;
    let takesValue = false;

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('--')) {
        long = trimmed.replace(/<[^>]+>$/, '').trim();
        if (part.includes('<')) takesValue = true;
      } else if (trimmed.startsWith('-')) {
        short = trimmed.split(' ')[0];
      }
    }

    // Determine default and parse function
    let parse = null;
    let def = undefined;
    if (typeof parseOrDefault === 'function') {
      parse = parseOrDefault;
      def = defaultValue;
    } else if (parseOrDefault !== undefined) {
      def = parseOrDefault;
    }

    this._options.push({ flags, short, long, takesValue, description, default: def, parse });
    return this;
  }

  argument(spec, _description) {
    // Spec: "<id>" or "<title...>" or "[id]"
    const variadic = spec.includes('...');
    const required = spec.startsWith('<');
    const name = spec.replace(/[<>\[\]\.]/g, '');
    this._arguments.push({ name, required, variadic });
    return this;
  }

  action(fn) {
    this._action = fn;
    return this;
  }

  // Get all options including inherited
  get options() { return this._options; }
  get commands() { return [...this._commands.values()]; }

  _printHelp() {
    if (this._helpFormatter) {
      process.stdout.write(this._helpFormatter(this, null));
      return;
    }

    let out = `\n  ${this._name}`;
    if (this._description) out += ` — ${this._description}`;
    out += '\n';

    if (this._commands.size > 0) {
      out += '\n  Commands:\n';
      const maxLen = Math.max(...[...this._commands.keys()].map(k => k.length));
      for (const [name, cmd] of this._commands) {
        out += `    ${name.padEnd(maxLen + 2)} ${cmd._description}\n`;
      }
    }

    if (this._options.length > 0) {
      out += '\n  Options:\n';
      for (const o of this._options) {
        out += `    ${o.flags.padEnd(28)} ${o.description}\n`;
      }
    }

    out += '\n';
    process.stdout.write(out);
  }

  async parse(argv = process.argv) {
    const args = argv.slice(2); // skip node and script path

    // Check --version at root level
    if (this._version && (args.includes('-v') || args.includes('--version'))) {
      console.log(this._version);
      process.exit(0);
    }

    // Check --help
    if (args.includes('-h') || args.includes('--help')) {
      // If help is for a subcommand
      const helpIdx = args.indexOf('--help') !== -1 ? args.indexOf('--help') : args.indexOf('-h');
      const beforeHelp = args.slice(0, helpIdx);
      if (beforeHelp.length > 0 && this._commands.has(beforeHelp[0])) {
        const subcmd = this._commands.get(beforeHelp[0]);
        if (beforeHelp.length > 1 && subcmd._commands.has(beforeHelp[1])) {
          subcmd._commands.get(beforeHelp[1])._printHelp();
        } else {
          subcmd._printHelp();
        }
      } else {
        this._printHelp();
      }
      process.exit(0);
    }

    // Route to subcommand
    if (args.length > 0 && this._commands.has(args[0])) {
      const cmdName = args[0];
      const cmd = this._commands.get(cmdName);
      const rest = args.slice(1);

      // Check for nested subcommand
      if (rest.length > 0 && cmd._commands.has(rest[0])) {
        const subName = rest[0];
        const subcmd = cmd._commands.get(subName);
        const subRest = rest.slice(1);
        return this._executeCommand(subcmd, subRest);
      }

      return this._executeCommand(cmd, rest);
    }

    // No matching command — show help if no default action
    if (this._action) {
      return this._executeCommand(this, args);
    }

    this._printHelp();
  }

  async _executeCommand(cmd, rawArgs) {
    // Build parseArgs config from command options
    const options = {};
    const shortToLong = {};

    for (const opt of cmd._options) {
      const longName = opt.long?.replace(/^--/, '') || '';
      if (!longName) continue;
      // Convert --dry-run to dryRun
      const camelName = longName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[longName] = {
        type: opt.takesValue ? 'string' : 'boolean',
        ...(opt.short ? { short: opt.short.replace(/^-/, '') } : {}),
      };
      shortToLong[longName] = camelName;
    }

    let parsed;
    try {
      parsed = parseArgs({
        args: rawArgs,
        options,
        allowPositionals: true,
        strict: false,
      });
    } catch {
      // Fallback: manual parsing if parseArgs fails
      parsed = { values: {}, positionals: [] };
      const pos = [];
      for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];
        if (arg.startsWith('--')) {
          const key = arg.slice(2);
          const opt = cmd._options.find(o => o.long === `--${key}`);
          if (opt?.takesValue && i + 1 < rawArgs.length) {
            parsed.values[key] = rawArgs[++i];
          } else {
            parsed.values[key] = true;
          }
        } else if (arg.startsWith('-') && arg.length === 2) {
          const opt = cmd._options.find(o => o.short === arg);
          if (opt?.takesValue && i + 1 < rawArgs.length) {
            const longKey = opt.long?.replace(/^--/, '') || '';
            parsed.values[longKey] = rawArgs[++i];
          } else {
            const longKey = opt?.long?.replace(/^--/, '') || arg.slice(1);
            parsed.values[longKey] = true;
          }
        } else {
          pos.push(arg);
        }
      }
      parsed.positionals = pos;
    }

    // Build opts object with camelCase keys and defaults
    const opts = {};
    for (const opt of cmd._options) {
      const longName = opt.long?.replace(/^--/, '') || '';
      const camelName = longName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      let value = parsed.values[longName];
      if (value === undefined) value = opt.default;
      if (value !== undefined && opt.parse) value = opt.parse(value);
      if (value !== undefined) opts[camelName] = value;
    }

    // Extract positional arguments
    const positionals = parsed.positionals || [];
    const actionArgs = [];

    for (let i = 0; i < cmd._arguments.length; i++) {
      const argDef = cmd._arguments[i];
      if (argDef.variadic) {
        actionArgs.push(positionals.slice(i));
      } else {
        actionArgs.push(positionals[i] || null);
      }
    }

    // Call action: action(arg1, arg2, opts) or action(opts)
    if (cmd._action) {
      await cmd._action(...actionArgs, opts);
    }
  }
}

export { Command };
