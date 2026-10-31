<?php

namespace App\Exceptions;

use RuntimeException;

final class GemmaException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $httpStatus = 502,
        private readonly string $safeMessage = 'Unable to process request with the AI provider',
    ) {
        parent::__construct($message);
    }

    public function statusCode(): int
    {
        return $this->httpStatus;
    }

    public function publicMessage(): string
    {
        return $this->safeMessage;
    }
}
