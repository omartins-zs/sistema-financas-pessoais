<?php

namespace App\Enums;

enum EntryPerson: string
{
    case Gabriel = 'gabriel';
    case Barbara = 'barbara';
    case Casa = 'casa';
    case Familia = 'familia';

    public function label(): string
    {
        return match ($this) {
            self::Gabriel => 'Gabriel',
            self::Barbara => 'Barbara',
            self::Casa => 'Casa',
            self::Familia => 'Família',
        };
    }

    public function badgeClasses(): string
    {
        return match ($this) {
            self::Gabriel => 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
            self::Barbara => 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30',
            self::Casa => 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
            self::Familia => 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30',
        };
    }

    public static function tryFromLabel(?string $raw): ?self
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $key = mb_strtolower(trim($raw));
        $key = str_replace(['á', 'à', 'ã', 'â'], 'a', $key);

        return match (true) {
            str_contains($key, 'gab') => self::Gabriel,
            str_contains($key, 'bab') || str_contains($key, 'barb') || str_contains($key, 'bibi') => self::Barbara,
            str_contains($key, 'famil') => self::Familia,
            str_contains($key, 'casa') || str_contains($key, 'amb') => self::Casa,
            default => self::tryFrom($key),
        };
    }
}
