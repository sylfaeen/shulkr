package dev.shulkr.core.paper.commands;

import dev.shulkr.core.paper.ShulkrCorePaperPlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class ShulkrCommand implements CommandExecutor {

    private final ShulkrCorePaperPlugin plugin;

    public ShulkrCommand(ShulkrCorePaperPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("shulkr.admin")) {
            sender.sendMessage("§cYou don't have permission to use this command.");
            return true;
        }
        if (args.length == 0) {
            sender.sendMessage("§eUsage: /shulkr <reload|status>");
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "reload":
                plugin.reloadPluginConfig();
                sender.sendMessage("§ashulkr-core config reloaded");
                return true;
            case "status":
                sendStatus(sender);
                return true;
            default:
                sender.sendMessage("§eUsage: /shulkr <reload|status>");
                return true;
        }
    }

    private void sendStatus(CommandSender sender) {
        var cfg = plugin.getPluginConfig();
        sender.sendMessage("§bshulkr-core v" + plugin.getDescription().getVersion() + " (" + plugin.platformLabel() + ")");
        if (cfg == null || !cfg.isValid()) {
            sender.sendMessage("§cConfig incomplete — push disabled.");
            return;
        }
        sender.sendMessage("§7Backend: §f" + cfg.getBackendUrl());
        sender.sendMessage("§7Server ID: §f" + cfg.getServerId());
        sender.sendMessage("§7Interval: §f" + cfg.getPushIntervalSeconds() + "s");
        var scheduler = plugin.getPushScheduler();
        if (scheduler != null) {
            sender.sendMessage("§7Last status: §f" + scheduler.getLastStatus());
            var last = scheduler.getLastPushAt();
            if (last > 0) {
                sender.sendMessage("§7Last push: §f" + ((System.currentTimeMillis() - last) / 1000) + "s ago");
            } else {
                sender.sendMessage("§7Last push: §fnever");
            }
        }
    }
}
