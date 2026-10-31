<?php

namespace App\Services\AI;

use App\Exceptions\InvalidAiResponseException;
use Illuminate\Http\UploadedFile;

final class ImageToDiagramService
{
    private const SYSTEM_PROMPT = <<<'PROMPT'
Act as a technical diagram image extraction assistant. Return only valid JSON with a summary string and a diagram object containing elements and connections. Supported shapes are rectangle, ellipse, diamond, and text. Every element must have a unique id, type, text, numeric x, y, positive width and height, and optional style backgroundColor and strokeColor. Every connection must have a unique id, from and to valid element IDs, and optional label. If a relationship is uncertain, return the element without a connection and never invent a relationship. Never return executable code or Excalidraw metadata.
PROMPT;

    public function __construct(
        private readonly GemmaService $gemma,
        private readonly DiagramContractValidator $validator,
    ) {}

    public function convert(array $request, UploadedFile $image): array
    {
        $modeInstruction = $request['mode'] === 'recreate'
            ? 'Identify elements, text, shapes, positions, and connections while preserving the original visual structure.'
            : 'Identify elements, text, shapes, and connections while preserving semantics; produce a cleaner layout with less overlap and better spacing and alignment.';
        $prompt = "Diagram type: {$request['diagramType']}. Mode: {$request['mode']}. {$modeInstruction} Return the canonical diagram contract.";

        $result = $this->parseJson($this->gemma->generateFromImage($image, $prompt, self::SYSTEM_PROMPT));
        if (! isset($result['summary']) || ! is_string($result['summary']) || ! isset($result['diagram']) || ! is_array($result['diagram'])) {
            throw new InvalidAiResponseException('Image response requires summary and diagram.');
        }
        $errors = $this->validator->validateDiagram($result['diagram']);
        if ($errors !== []) {
            throw new InvalidAiResponseException(implode(' ', $errors));
        }

        return [
            'summary' => $result['summary'],
            'diagram' => $result['diagram'],
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
            throw new InvalidAiResponseException('Image response was not valid JSON.');
        }

        if (! is_array($decoded)) {
            throw new InvalidAiResponseException('Image response must be a JSON object.');
        }

        return $decoded;
    }
}
