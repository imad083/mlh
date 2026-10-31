<?php

namespace App\Services\AI;

use App\Exceptions\InvalidAiResponseException;

final class DiagramEditingService
{
    private const SYSTEM_PROMPT = <<<'PROMPT'
Act as a technical diagram assistant. Use the current diagram as context and respect the requested editing scope. Preserve existing elements unless a change is requested. Do not regenerate the whole diagram for a small change. Maintain logical connections and avoid unnecessary duplicate relationships. Use valid, unique IDs. Return only valid JSON with a summary string and an actions array using only the allowed actions and supported shapes. Never return executable code. Do not invent relationships when intent is unclear.
PROMPT;

    public function __construct(
        private readonly GemmaService $gemma,
        private readonly DiagramContractValidator $validator,
    ) {}

    public function edit(array $request): array
    {
        $diagram = $request['diagram'];
        $prompt = json_encode([
            'instruction' => $request['prompt'],
            'diagramType' => $request['diagramType'],
            'scope' => $request['scope'],
            'selectedElementIds' => $request['selectedElementIds'] ?? [],
            'diagram' => $diagram,
            'requiredResponse' => [
                'summary' => 'string',
                'actions' => 'array of allowed actions',
            ],
        ], JSON_THROW_ON_ERROR);

        $result = $this->parseJson($this->gemma->generateText($prompt, self::SYSTEM_PROMPT));
        if (! isset($result['summary']) || ! is_string($result['summary']) || ! isset($result['actions']) || ! is_array($result['actions'])) {
            throw new InvalidAiResponseException('Edit response requires summary and actions.');
        }

        $this->validator->validateActions($result['actions'], $diagram);

        return [
            'summary' => $result['summary'],
            'actions' => array_values($result['actions']),
        ];
    }

    private function parseJson(string $text): array
    {
        $clean = trim($text);
        if (str_starts_with($clean, '```')) {
            $clean = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', $clean) ?? $clean;
        }

        try {
            $decoded = json_decode(trim($clean), true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new InvalidAiResponseException('Edit response was not valid JSON.');
        }

        if (! is_array($decoded)) {
            throw new InvalidAiResponseException('Edit response must be a JSON object.');
        }

        return $decoded;
    }
}
