<?php

namespace App\Exceptions;

use RuntimeException;

final class InvalidAiResponseException extends RuntimeException
{
    public function __construct(string $message)
    {
        parent::__construct($message);
    }

    public function statusCode(): int
    {
        return 502;
    }

    public function publicMessage(): string
    {
        return 'The AI provider returned an invalid response';
    }
}
