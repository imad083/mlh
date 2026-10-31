<?php

namespace Tests\Feature;

use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CanvasMindApiTest extends TestCase
{
    public function test_health_uses_the_success_envelope(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJson([
                'status' => 'success',
                'message' => 'Request processed successfully',
                'data' => ['service' => 'CanvasMind API', 'status' => 'ok'],
            ]);
    }

    public function test_edit_rejects_selected_scope_without_selection(): void
    {
        $this->postJson('/api/v1/ai/edit', [
            'prompt' => 'Change the service',
            'diagramType' => 'system_architecture',
            'scope' => 'selected',
            'selectedElementIds' => [],
            'diagram' => ['elements' => [], 'connections' => []],
        ])
            ->assertStatus(422)
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('data', null);
    }

    public function test_edit_returns_only_validated_actions(): void
    {
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => "```json\n{\"summary\":\"Added cache\",\"actions\":[{\"type\":\"create_shape\",\"element\":{\"id\":\"cache-1\",\"type\":\"rectangle\",\"text\":\"Redis\",\"x\":300,\"y\":100,\"width\":140,\"height\":60}}]}\n```",
                    ]]],
                ]],
            ]),
        ]);

        $response = $this->postJson('/api/v1/ai/edit', [
            'prompt' => 'Add a Redis cache',
            'diagramType' => 'system_architecture',
            'scope' => 'all',
            'selectedElementIds' => [],
            'diagram' => [
                'elements' => [[
                    'id' => 'api-1',
                    'type' => 'rectangle',
                    'text' => 'API',
                    'x' => 100,
                    'y' => 100,
                    'width' => 140,
                    'height' => 60,
                ]],
                'connections' => [],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.summary', 'Added cache')
            ->assertJsonPath('data.actions.0.type', 'create_shape')
            ->assertJsonPath('data.actions.0.element.id', 'cache-1');
    }

    public function test_image_conversion_returns_a_canonical_diagram(): void
    {
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => '{"summary":"Extracted diagram","diagram":{"elements":[{"id":"client-1","type":"ellipse","text":"Client","x":20,"y":20,"width":120,"height":60}],"connections":[]}}',
                    ]]],
                ]],
            ]),
        ]);

        $response = $this->post('/api/v1/ai/image-to-diagram', [
            'image' => UploadedFile::fake()->image('diagram.png', 100, 100),
            'mode' => 'recreate',
            'diagramType' => 'flowchart',
        ]);

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('data.diagram.elements.0.id', 'client-1');
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/models/'));
    }

    public function test_image_conversion_rejects_unsupported_file_types(): void
    {
        $this->post('/api/v1/ai/image-to-diagram', [
            'image' => UploadedFile::fake()->create('diagram.pdf', 10, 'application/pdf'),
            'mode' => 'reconstruct',
            'diagramType' => 'flowchart',
        ])
            ->assertStatus(422)
            ->assertJsonPath('status', 'error');
    }
}
