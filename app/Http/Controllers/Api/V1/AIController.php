<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\GemmaException;
use App\Exceptions\InvalidAiResponseException;
use App\Http\Controllers\Controller;
use App\Http\Requests\AIEditRequest;
use App\Http\Requests\ImageToDiagramRequest;
use App\Services\AI\DiagramEditingService;
use App\Services\AI\ImageToDiagramService;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

final class AIController extends Controller
{
    public function __construct(
        private readonly DiagramEditingService $diagramEditingService,
        private readonly ImageToDiagramService $imageToDiagramService,
    ) {}

    public function edit(AIEditRequest $request): JsonResponse
    {
        try {
            return ApiResponse::success(
                $this->diagramEditingService->edit($request->validated()),
            );
        } catch (GemmaException|InvalidAiResponseException $exception) {
            Log::warning('AI edit request failed', ['reason' => $exception->getMessage()]);

            return ApiResponse::error($exception->publicMessage(), $exception->statusCode());
        }
    }

    public function imageToDiagram(ImageToDiagramRequest $request): JsonResponse
    {
        try {
            return ApiResponse::success(
                $this->imageToDiagramService->convert($request->validated(), $request->file('image')),
            );
        } catch (GemmaException|InvalidAiResponseException $exception) {
            Log::warning('Image to diagram request failed', ['reason' => $exception->getMessage()]);

            return ApiResponse::error($exception->publicMessage(), $exception->statusCode());
        }
    }
}
