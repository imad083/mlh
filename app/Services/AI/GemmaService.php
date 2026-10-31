<?php

namespace App\Services\AI;

use App\Exceptions\GemmaException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

final class GemmaService
{
    public function generateText(string $prompt, string $systemPrompt): string
    {
        return $this->request([
            'systemInstruction' => ['parts' => [['text' => $systemPrompt]]],
            'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
        ]);
    }

    public function generateFromImage(UploadedFile $image, string $prompt, string $systemPrompt): string
    {
        $contents = [
            'role' => 'user',
            'parts' => [
                ['text' => $prompt],
                [
                    'inlineData' => [
                        'mimeType' => $image->getMimeType(),
                        'data' => base64_encode((string) file_get_contents($image->getRealPath())),
                    ],
                ],
            ],
        ];

        return $this->request([
            'systemInstruction' => ['parts' => [['text' => $systemPrompt]]],
            'contents' => [$contents],
        ]);
    }

    private function request(array $payload): string
    {
        $apiKey = (string) config('services.gemini.api_key');
        $model = (string) config('services.gemini.model');
        $baseUrl = rtrim((string) config('services.gemini.base_url'), '/');
        if ($apiKey === '' || $model === '' || $baseUrl === '') {
            throw new GemmaException('Gemini configuration is incomplete.', 503, 'AI service is not configured');
        }

        try {
            $response = Http::acceptJson()
                ->timeout((int) config('services.gemini.timeout', 60))
                ->post("{$baseUrl}/models/{$model}:generateContent?key={$apiKey}", $payload);
        } catch (ConnectionException $exception) {
            throw new GemmaException('Gemini connection failed: '.$exception->getMessage(), 504, 'AI service timed out');
        }

        if ($response->status() === 401 || $response->status() === 403) {
            throw new GemmaException('Gemini authentication failed.', 502, 'AI service credentials are invalid');
        }
        if ($response->status() === 404) {
            throw new GemmaException('Gemini model or endpoint was not found.', 502, 'The configured AI model is unavailable');
        }
        if ($response->status() === 429) {
            throw new GemmaException('Gemini rate limit reached.', 429, 'AI service rate limit reached; please try again');
        }
        if ($response->serverError()) {
            throw new GemmaException('Gemini provider server error.', 502);
        }
        if ($response->failed()) {
            throw new GemmaException('Gemini provider rejected the request.', 502, 'AI provider rejected the request');
        }

        return $this->extractText($response);
    }

    private function extractText(Response $response): string
    {
        $parts = $response->json('candidates.0.content.parts', []);
        if (! is_array($parts)) {
            throw new GemmaException('Gemini response did not contain text.', 502, 'AI provider returned no usable content');
        }

        $text = collect($parts)
            ->filter(fn (mixed $part): bool => is_array($part) && isset($part['text']) && is_string($part['text']))
            ->pluck('text')
            ->implode("\n");

        if (trim($text) === '') {
            throw new GemmaException('Gemini response text was empty.', 502, 'AI provider returned no usable content');
        }

        return $text;
    }
}
