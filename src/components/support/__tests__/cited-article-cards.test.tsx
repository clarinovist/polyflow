// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CitedArticleCards, type CitedArticle } from '../cited-article-cards';

const article: CitedArticle = {
    slug: 'primary-guide',
    title: 'Panduan utama',
};
const relatedArticle: CitedArticle = {
    slug: 'related-guide',
    title: 'Panduan terkait',
};

// Render the real leaf and Next Link; assertions inspect the resulting anchors.
describe('CitedArticleCards', () => {
    it.each<{ label: string; relatedArticles?: CitedArticle[] }>([
        { label: 'undefined' },
        { label: 'empty', relatedArticles: [] },
        { label: 'nonempty', relatedArticles: [relatedArticle] },
    ])('renders nothing for empty citations with $label related articles', ({ relatedArticles }) => {
        const { container } = render(<CitedArticleCards articles={[]} relatedArticles={relatedArticles} />);

        expect(container.firstChild).toBeNull();
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    it('preserves citation order and full titles while showing at most three', () => {
        const articles: CitedArticle[] = [
            { slug: 'z-last-alphabetically', title: 'Judul panduan pertama yang panjangnya melebihi tiga puluh lima karakter' },
            { slug: 'a-first-alphabetically', title: 'Panduan kedua' },
            { slug: 'middle-guide', title: 'Panduan ketiga' },
            { slug: 'omitted-guide', title: 'Panduan keempat' },
        ];
        render(<CitedArticleCards articles={articles} />);

        expect(screen.getByText('Referensi Artikel Bantuan:')).toBeTruthy();
        const links = screen.getAllByRole('link');
        expect(links.map((link) => link.textContent)).toEqual(articles.slice(0, 3).map((item) => item.title));
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/support/z-last-alphabetically',
            '/support/a-first-alphabetically',
            '/support/middle-guide',
        ]);
        expect(screen.queryByText('Panduan keempat')).toBeNull();
    });

    it.each<{ label: string; summary?: string; paragraphCount: number }>([
        { label: 'defined', summary: 'Ringkasan panduan', paragraphCount: 2 },
        { label: 'empty', summary: '', paragraphCount: 1 },
        { label: 'undefined', paragraphCount: 1 },
    ])('renders a summary paragraph only for a nonempty summary ($label)', ({ summary, paragraphCount }) => {
        render(<CitedArticleCards articles={[{ ...article, summary }]} />);

        const paragraphs = screen.getByRole('link').querySelectorAll('p');
        expect(paragraphs).toHaveLength(paragraphCount);
        expect(paragraphs[0].textContent).toBe(article.title);
        if (paragraphCount === 2) {
            expect(paragraphs[1].textContent).toBe(summary);
            expect(paragraphs[1].className).toBe('text-[11px] text-muted-foreground line-clamp-1 mt-0.5');
        }
    });

    it.each<{ label: string; relatedArticles?: CitedArticle[] }>([
        { label: 'undefined' },
        { label: 'empty', relatedArticles: [] },
    ])('omits the related section when related articles are $label', ({ relatedArticles }) => {
        render(<CitedArticleCards articles={[article]} relatedArticles={relatedArticles} />);

        expect(screen.queryByText('Terkait:')).toBeNull();
        expect(screen.getAllByRole('link')).toHaveLength(1);
    });

    it('renders a single related article after the citations', () => {
        render(<CitedArticleCards articles={[article]} relatedArticles={[relatedArticle]} />);

        expect(screen.getByText('Terkait:')).toBeTruthy();
        expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
            article.title,
            relatedArticle.title,
        ]);
        expect(screen.getByRole('link', { name: relatedArticle.title }).getAttribute('href')).toBe('/support/related-guide');
    });

    it('preserves related article order while showing at most three', () => {
        const relatedArticles: CitedArticle[] = [
            { slug: 'z-related', title: 'Terkait pertama' },
            { slug: 'a-related', title: 'Terkait kedua' },
            { slug: 'middle-related', title: 'Terkait ketiga' },
            { slug: 'omitted-related', title: 'Terkait keempat' },
        ];
        render(<CitedArticleCards articles={[article]} relatedArticles={relatedArticles} />);

        const links = screen.getAllByRole('link');
        expect(links.map((link) => link.textContent)).toEqual([
            article.title, ...relatedArticles.slice(0, 3).map((item) => item.title),
        ]);
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/support/primary-guide', '/support/z-related', '/support/a-related', '/support/middle-related',
        ]);
        expect(screen.queryByText('Terkait keempat')).toBeNull();
    });

    it.each([
        { length: 35, title: 'a'.repeat(35), expected: 'a'.repeat(35) },
        { length: 36, title: 'a'.repeat(35) + 'b', expected: 'a'.repeat(35) + '…' },
    ])('preserves the truncation boundary for a $length-character related title', ({ title, expected }) => {
        render(<CitedArticleCards articles={[article]} relatedArticles={[{ ...relatedArticle, title }]} />);

        const link = screen.getByRole('link', { name: expected });
        expect(link.textContent).toBe(expected);
        expect(link.getAttribute('href')).toBe('/support/related-guide');
    });

    it('preserves responsive layout, card styling and icons', () => {
        const { container } = render(<CitedArticleCards articles={[article]} relatedArticles={[relatedArticle]} />);

        expect(container.firstElementChild?.className).toBe('mt-3 space-y-2 pt-2 border-t border-border/40');
        const heading = screen.getByText('Referensi Artikel Bantuan:');
        expect(heading.className).toBe('text-[11px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5');
        expect(heading.querySelector('svg.lucide-book-open')?.getAttribute('class')).toContain('h-3.5 w-3.5 text-emerald-500');

        const citation = screen.getByRole('link', { name: article.title });
        expect(citation.parentElement?.className).toBe('grid gap-2 sm:grid-cols-2');
        expect(citation.className).toBe('group flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/60 p-3 hover:bg-card hover:border-emerald-500/50 hover:shadow-sm transition-all duration-200');
        expect(citation.querySelector('svg.lucide-book-open')?.getAttribute('class')).toContain('h-4 w-4');
        expect(citation.querySelector('svg.lucide-arrow-right')?.getAttribute('class')).toContain('h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all self-center shrink-0');
        const title = screen.getByText(article.title);
        expect(title.parentElement?.className).toBe('flex-1 min-w-0');
        expect(title.className).toBe('text-xs font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 line-clamp-1 transition-colors');

        const related = screen.getByRole('link', { name: relatedArticle.title });
        expect(related.parentElement?.className).toBe('flex flex-wrap items-center gap-1.5 pt-1');
        expect(related.className).toBe('text-[11px] px-2.5 py-1 rounded-full border border-border/50 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors');
    });
});
