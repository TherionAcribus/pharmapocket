from wagtail import blocks
from wagtail.documents.blocks import DocumentChooserBlock
from wagtail.images.blocks import ImageChooserBlock


class Mechanism3StepsBlock(blocks.StructBlock):
    target = blocks.CharBlock(required=True, max_length=120)
    action = blocks.CharBlock(required=True, max_length=180)
    consequence = blocks.CharBlock(required=True, max_length=180)


class ImageWithCaptionBlock(blocks.StructBlock):
    image = ImageChooserBlock(required=True)
    caption = blocks.CharBlock(required=False, max_length=200)


class ReferenceBlock(blocks.StructBlock):
    title = blocks.CharBlock(required=True, max_length=200)
    url = blocks.URLBlock(required=False)
    source = blocks.CharBlock(required=False, max_length=200)
    date = blocks.DateBlock(required=False)
    document = DocumentChooserBlock(required=False)
