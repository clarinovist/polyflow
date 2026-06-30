import { describe, expect, it } from 'vitest';
import { parseIndonesianPrice, formatIndonesianPrice } from '../price-format';

describe('parseIndonesianPrice', () => {
  // Indonesian format (dot = thousands, comma = decimal)
  it('parses Indonesian format with decimal', () => {
    expect(parseIndonesianPrice('1.000.000,32')).toBe(1000000.32);
    expect(parseIndonesianPrice('10.000,50')).toBe(10000.50);
    expect(parseIndonesianPrice('1.000,99')).toBe(1000.99);
  });

  it('parses Indonesian format without decimal', () => {
    expect(parseIndonesianPrice('1.000.000')).toBe(1000000);
    expect(parseIndonesianPrice('10.000')).toBe(10000);
    expect(parseIndonesianPrice('1.000')).toBe(1000);
  });

  // International format (comma = thousands, dot = decimal)
  it('parses international format with decimal', () => {
    expect(parseIndonesianPrice('1,000,000.32')).toBe(1000000.32);
    expect(parseIndonesianPrice('10,000.50')).toBe(10000.50);
  });

  it('parses international format without decimal', () => {
    expect(parseIndonesianPrice('1,000,000')).toBe(1000000);
    expect(parseIndonesianPrice('10,000')).toBe(10000);
  });

  // Plain numbers
  it('parses plain numbers', () => {
    expect(parseIndonesianPrice('1000000')).toBe(1000000);
    expect(parseIndonesianPrice('1000000.32')).toBe(1000000.32);
    expect(parseIndonesianPrice('1000000,32')).toBe(1000000.32);
  });

  // With Rp prefix
  it('parses with Rp prefix', () => {
    expect(parseIndonesianPrice('Rp 1.000.000')).toBe(1000000);
    expect(parseIndonesianPrice('Rp1.000.000')).toBe(1000000);
    expect(parseIndonesianPrice('Rp 1.000.000,32')).toBe(1000000.32);
    expect(parseIndonesianPrice('Rp. 1.000.000')).toBe(1000000);
  });

  // Edge cases
  it('handles edge cases', () => {
    expect(parseIndonesianPrice('')).toBe(0);
    expect(parseIndonesianPrice('Rp')).toBe(0);
    expect(parseIndonesianPrice('Rp ')).toBe(0);
    expect(parseIndonesianPrice('0')).toBe(0);
    expect(parseIndonesianPrice('0,00')).toBe(0);
  });
});

describe('formatIndonesianPrice', () => {
  it('formats numbers to Indonesian format', () => {
    expect(formatIndonesianPrice(1000000)).toBe('1.000.000');
    expect(formatIndonesianPrice(10000)).toBe('10.000');
    expect(formatIndonesianPrice(1000)).toBe('1.000');
  });

  it('formats numbers with decimal', () => {
    expect(formatIndonesianPrice(1000000.32)).toBe('1.000.000,32');
    expect(formatIndonesianPrice(10000.5)).toBe('10.000,5');
    expect(formatIndonesianPrice(1000.99)).toBe('1.000,99');
  });

  it('formats zero', () => {
    expect(formatIndonesianPrice(0)).toBe('0');
  });

  it('formats small numbers', () => {
    expect(formatIndonesianPrice(100)).toBe('100');
    expect(formatIndonesianPrice(50)).toBe('50');
    expect(formatIndonesianPrice(1)).toBe('1');
  });
});
