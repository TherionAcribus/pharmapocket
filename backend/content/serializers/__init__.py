"""Serializers de l'app `content`, séparés entrée / sortie.

`inputs` valide les corps de requête (un serializer par endpoint), `outputs`
décrit la forme des réponses. Ce module réexporte les serializers de sortie pour
que `from ..serializers import MicroArticleListSerializer` continue de marcher ;
les serializers d'entrée s'importent depuis `.serializers.inputs`.
"""

from .outputs import MicroArticleDetailSerializer, MicroArticleListSerializer

__all__ = [
    "MicroArticleDetailSerializer",
    "MicroArticleListSerializer",
]
