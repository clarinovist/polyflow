import fs from 'fs';
import path from 'path';
import { ChangelogBannerClient } from './changelog-banner-client';

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function AutoChangelogBanner() {
        let bannerProps = null;
        try {
            const filePath = path.join(process.cwd(), 'CHANGELOG.md');
            if (!fs.existsSync(filePath)) return null;
            
            const content = fs.readFileSync(filePath, 'utf-8');
            const versionMatch = content.match(/## \[([^\]]+)\]/);
            if (!versionMatch) return null;
            
            const version = versionMatch[1];
            const startIndex = versionMatch.index;
            
            const nextVersionMatch = content.substring(startIndex! + 10).match(/## \[/);
            const endIndex = nextVersionMatch ? startIndex! + 10 + nextVersionMatch.index! : content.length;
            
            let notes = content.substring(startIndex! + versionMatch[0].length, endIndex).trim();
            notes = escapeHtml(notes);
            
            // Simplify markdown for the UI rendering since it's naive
            notes = notes
              // Strip the first lines like " (2026-03-04)"
              .replace(/^\s*\([^)]+\)\s*\n/, '')
              // Convert Headers
              .replace(/### (.*)/g, '<h3 class="font-semibold text-foreground mt-3 mb-1 text-sm">$1</h3>')
              // Convert Bolds
              .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>')
              // Convert lists
              .replace(/\* (.*)/g, '<li class="ml-4 list-disc leading-relaxed">$1</li>')
              // Strip out git commit links
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '')
              // Remove multiple new lines
              .replace(/\n\n/g, '<br/>');

            bannerProps = { version, notesHtml: notes };
        } catch(err) {
            console.error("Failed to parse changelog for banner:", err);
            return null;
        }
        
        if (!bannerProps) return null;
        return <ChangelogBannerClient {...bannerProps} />;
    }
