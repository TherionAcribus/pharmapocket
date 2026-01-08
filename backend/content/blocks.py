from wagtail import blocks
from wagtail.documents.blocks import DocumentChooserBlock
from wagtail.images.blocks import ImageChooserBlock
from wagtail.snippets.blocks import SnippetChooserBlock


class Mechanism3StepsBlock(blocks.StructBlock):
    target = blocks.CharBlock(required=True, max_length=120)
    action = blocks.CharBlock(required=True, max_length=180)
    consequence = blocks.CharBlock(required=True, max_length=180)


class ImageWithCaptionBlock(blocks.StructBlock):
    image = ImageChooserBlock(required=True)
    caption = blocks.CharBlock(required=False, max_length=200)


class ReferenceBlock(blocks.StructBlock):
    source = SnippetChooserBlock("content.Source", required=True)
    note = blocks.TextBlock(required=False, help_text="Contexte ou citation courte")
    page = blocks.CharBlock(required=False, max_length=60, help_text="Page/chapitre")
    document = DocumentChooserBlock(required=False)
